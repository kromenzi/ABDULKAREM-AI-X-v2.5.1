const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function bool(v, fallback=false){ return typeof v === 'boolean' ? v : fallback; }
function nowIso(){ return new Date().toISOString(); }
function clean(v,max=2000){ return String(v ?? '').replace(/\u0000/g,'').trim().slice(0,max); }

function startupLaunchSpec({isPackaged=false, execPath='', appPath='', platform=process.platform, powershellPath='', backgroundArg='--background'}={}){
  const exe=clean(execPath,4000);
  const project=clean(appPath,4000);
  if(isPackaged) return exe ? {path:exe,args:[backgroundArg]} : {path:'',args:[]};
  if(platform==='win32' && project){
    const ps=clean(powershellPath,4000) || path.join(process.env.SystemRoot || 'C:\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    return {path:ps,args:['-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(project,'BACKGROUND-RUNTIME.ps1')]};
  }
  return exe ? {path:exe,args:[project,backgroundArg].filter(Boolean)} : {path:'',args:[]};
}

function shouldKeepRunningOnWindowClose(settings={}){
  return bool(settings.backgroundMode,true) && bool(settings.minimizeToTray,true);
}

function shouldNotify({settings={},type='',status='',windowVisible=false}={}){
  if(settings.trayNotifications===false) return false;
  const t=String(type||'').toLowerCase();
  const s=String(status||'').toLowerCase();
  if(s==='error' || s==='pending') return ['automation','workflow','integration','system'].includes(t);
  if(!windowVisible && s==='done') return ['automation','workflow'].includes(t);
  return false;
}

class RuntimeManager {
  constructor({app,Tray,Menu,nativeImage,Notification,platform=process.platform,iconPath,logPath,getSettings,getAutomationStatus,getRecoveryStatus,isWindowVisible,onOpenWindow,onQuit,onPauseScheduler,onResumeScheduler,onOpenAutomations,onPersistStartup}={}){
    this.app=app; this.Tray=Tray; this.Menu=Menu; this.nativeImage=nativeImage; this.Notification=Notification; this.platform=platform;
    this.iconPath=iconPath||''; this.logPath=logPath||'';
    this.getSettings=typeof getSettings==='function'?getSettings:()=>({});
    this.getAutomationStatus=typeof getAutomationStatus==='function'?getAutomationStatus:()=>({});
    this.getRecoveryStatus=typeof getRecoveryStatus==='function'?getRecoveryStatus:()=>({});
    this.isWindowVisible=typeof isWindowVisible==='function'?isWindowVisible:()=>false;
    this.onOpenWindow=typeof onOpenWindow==='function'?onOpenWindow:()=>{};
    this.onQuit=typeof onQuit==='function'?onQuit:()=>{};
    this.onPauseScheduler=typeof onPauseScheduler==='function'?onPauseScheduler:()=>{};
    this.onResumeScheduler=typeof onResumeScheduler==='function'?onResumeScheduler:()=>{};
    this.onOpenAutomations=typeof onOpenAutomations==='function'?onOpenAutomations:this.onOpenWindow;
    this.onPersistStartup=typeof onPersistStartup==='function'?onPersistStartup:async()=>{};
    this.tray=null; this.menuTimer=null; this.startedAt=nowIso(); this.backgroundRequested=process.argv.includes('--background');
  }

  async init(){
    const s=this.getSettings()||{};
    if(s.backgroundMode!==false || s.minimizeToTray!==false) this.ensureTray();
    await this.syncStartup(Boolean(s.launchAtStartup)).catch(()=>{});
    await this.log('runtime_init',{backgroundRequested:this.backgroundRequested,settings:this.publicSettings(s)});
    return this.status();
  }

  publicSettings(s={}){
    return {backgroundMode:s.backgroundMode!==false,minimizeToTray:s.minimizeToTray!==false,launchAtStartup:Boolean(s.launchAtStartup),trayNotifications:s.trayNotifications!==false};
  }

  ensureTray(){
    if(this.tray || !this.Tray || !this.Menu) return;
    let image=null;
    try { image=this.nativeImage?.createFromPath?.(this.iconPath); } catch {}
    if(!image || image.isEmpty?.()){
      try { image=this.nativeImage?.createFromDataURL?.('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69q9WQAAAABJRU5ErkJggg=='); } catch {}
    }
    try {
      this.tray=new this.Tray(image);
      this.tray.setToolTip('ABDULKAREM AI X — Background Runtime');
      this.tray.on('double-click',()=>this.onOpenWindow());
      this.tray.on('click',()=>this.onOpenWindow());
      this.refreshMenu();
      this.menuTimer=setInterval(()=>this.refreshMenu(),5000);
      this.menuTimer.unref?.();
    } catch { this.tray=null; }
  }

  destroyTray(){
    if(this.menuTimer){ clearInterval(this.menuTimer); this.menuTimer=null; }
    try { this.tray?.destroy?.(); } catch {}
    this.tray=null;
  }

  refreshMenu(){
    if(!this.tray || !this.Menu) return;
    const s=this.getSettings()||{};
    const a=this.getAutomationStatus()||{};
    const recovery=this.getRecoveryStatus()||{};
    const schedulerRunning=!a.stopped;
    const menu=this.Menu.buildFromTemplate([
      {label:'فتح ABDULKAREM AI X',click:()=>this.onOpenWindow()},
      {label:`Automations: ${Number(a.enabled||0)} enabled · ${Number(a.running||0)} running`,enabled:false},
      {label:`Recovery Guard: ${recovery.safeMode?'SAFE MODE':'ready'} · ${Number(recovery.recoveries||0)} recoveries`,enabled:false},
      {label:'فتح الأتمتة',click:()=>this.onOpenAutomations()},
      {type:'separator'},
      {label:schedulerRunning?'إيقاف Scheduler مؤقتًا':'تشغيل Scheduler',click:()=>schedulerRunning?this.onPauseScheduler():this.onResumeScheduler()},
      {label:'تشغيل مع Windows',type:'checkbox',checked:Boolean(s.launchAtStartup),click:async item=>{await this.onPersistStartup(Boolean(item.checked));this.refreshMenu();}},
      {type:'separator'},
      {label:'إنهاء ABDULKAREM AI X',click:()=>this.onQuit()}
    ]);
    this.tray.setContextMenu(menu);
    const badge=Number(a.waitingApproval||0)>0?` · ${a.waitingApproval} approval`:`${Number(a.queued||0)>0?` · ${a.queued} queued`:''}`;
    this.tray.setToolTip(`ABDULKAREM AI X — Background Runtime${badge}`);
  }

  startupSpec(){
    return startupLaunchSpec({isPackaged:Boolean(this.app?.isPackaged),execPath:process.execPath,appPath:this.app?.getAppPath?.()||'',platform:this.platform});
  }

  async syncStartup(enabled){
    if(this.platform!=='win32' || !this.app?.setLoginItemSettings) return {success:true,supported:false,enabled:false,reason:'Windows-only feature'};
    const spec=this.startupSpec();
    try {
      this.app.setLoginItemSettings({openAtLogin:Boolean(enabled),path:spec.path,args:spec.args});
      const state=this.app.getLoginItemSettings?.({path:spec.path,args:spec.args}) || {};
      await this.log('startup_sync',{requested:Boolean(enabled),reported:Boolean(state.openAtLogin),path:spec.path,args:spec.args});
      return {success:true,supported:true,enabled:Boolean(state.openAtLogin),requested:Boolean(enabled),path:spec.path,args:spec.args};
    } catch(e){
      await this.log('startup_error',{requested:Boolean(enabled),error:e.message||String(e)});
      return {success:false,supported:true,enabled:false,error:e.message||String(e),path:spec.path,args:spec.args};
    }
  }

  async applySettings(){
    const s=this.getSettings()||{};
    if(s.backgroundMode!==false || s.minimizeToTray!==false) this.ensureTray(); else this.destroyTray();
    const startup=await this.syncStartup(Boolean(s.launchAtStartup));
    this.refreshMenu();
    return {...this.status(),startup};
  }

  async setStartup(enabled){
    await this.onPersistStartup(Boolean(enabled));
    return this.syncStartup(Boolean(enabled));
  }

  status(){
    const s=this.getSettings()||{}; const a=this.getAutomationStatus()||{}; const recovery=this.getRecoveryStatus()||{}; const spec=this.startupSpec();
    let login={}; try { login=this.app?.getLoginItemSettings?.({path:spec.path,args:spec.args})||{}; } catch {}
    return {
      success:true,
      pid:process.pid,
      platform:this.platform,
      packaged:Boolean(this.app?.isPackaged),
      backgroundRequested:this.backgroundRequested,
      backgroundMode:s.backgroundMode!==false,
      minimizeToTray:s.minimizeToTray!==false,
      trayNotifications:s.trayNotifications!==false,
      trayActive:Boolean(this.tray),
      windowVisible:Boolean(this.isWindowVisible()),
      startupRequested:Boolean(s.launchAtStartup),
      startupEnabled:Boolean(login.openAtLogin),
      schedulerRunning:!a.stopped,
      automations:{enabled:Number(a.enabled||0),running:Number(a.running||0),queued:Number(a.queued||0),waitingApproval:Number(a.waitingApproval||0)},
      recovery:{safeMode:Boolean(recovery.safeMode),previousUnclean:Boolean(recovery.previousUnclean),recoveries:Number(recovery.recoveries||0),crashCount5m:Number(recovery.crashCount5m||0),rendererRestarts:Number(recovery.rendererRestarts||0),workerFailures:Number(recovery.workerFailures||0)},
      startedAt:this.startedAt,
      startupSpec:spec,
      logPath:this.logPath
    };
  }

  async log(kind,data={}){
    if(!this.logPath) return;
    try { await fsp.mkdir(path.dirname(this.logPath),{recursive:true}); await fsp.appendFile(this.logPath,JSON.stringify({at:nowIso(),kind,...data})+'\n','utf8'); } catch {}
  }

  async notifyEvent(label,detail,status='running',type='tool'){
    await this.log('event',{label:clean(label,300),detail:clean(detail,1600),status:clean(status,80),type:clean(type,80)});
    const settings=this.getSettings()||{};
    if(!shouldNotify({settings,type,status,windowVisible:this.isWindowVisible()})) return false;
    try {
      if(!this.Notification?.isSupported?.()) return false;
      const n=new this.Notification({title:clean(label,120)||'ABDULKAREM AI X',body:clean(detail,280)||String(status||'').toUpperCase(),silent:false});
      n.on('click',()=>this.onOpenWindow()); n.show(); return true;
    } catch { return false; }
  }

  async openLogs(){
    if(!this.logPath) return false;
    try { await fsp.mkdir(path.dirname(this.logPath),{recursive:true}); if(!fs.existsSync(this.logPath))await fsp.writeFile(this.logPath,'','utf8'); return this.app?.getPath?this.logPath:false; } catch { return false; }
  }

  destroy(){ this.destroyTray(); }
}

module.exports={RuntimeManager,startupLaunchSpec,shouldKeepRunningOnWindowClose,shouldNotify};
