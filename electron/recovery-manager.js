const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

function nowIso(){ return new Date().toISOString(); }
function uid(prefix='session'){ return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`; }
function clean(v,max=4000){ return String(v ?? '').replace(/\u0000/g,'').trim().slice(0,max); }
function redact(v){ return String(v ?? '').replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g,'[REDACTED]').replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]{12,}/gi,'$1[REDACTED]').replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*["']?)[^\s"']{8,}/gi,'$1[REDACTED]'); }
function safeObject(v){ try{return JSON.parse(redact(JSON.stringify(v)));}catch{return {text:redact(String(v))};} }
function clone(v){ try{return JSON.parse(JSON.stringify(v));}catch{return null;} }
function pruneTimes(rows, windowMs){ const now=Date.now(); return (Array.isArray(rows)?rows:[]).filter(x=>Number(x)>0 && now-Number(x)<=windowMs); }
function errorShape(error){
  if(error instanceof Error) return {name:error.name||'Error',message:redact(clean(error.message,5000)),stack:redact(clean(error.stack,16000))};
  return {name:'Error',message:redact(clean(error,5000)),stack:''};
}

class RecoveryManager {
  constructor({app,statePath,sessionPath,crashDir,onEvent,onRecoverRenderer,terminateOnFatal=true,heartbeatMs=10000}={}){
    this.app=app;
    this.statePath=statePath||'';
    this.sessionPath=sessionPath||'';
    this.crashDir=crashDir||'';
    this.onEvent=typeof onEvent==='function'?onEvent:()=>{};
    this.onRecoverRenderer=typeof onRecoverRenderer==='function'?onRecoverRenderer:()=>{};
    this.terminateOnFatal=terminateOnFatal!==false;
    this.heartbeatMs=Math.max(3000,Number(heartbeatMs||10000));
    this.state={version:1,crashTimes:[],rendererCrashTimes:[],workerFailures:0,rendererRestarts:0,recoveries:0,lastCrash:null,lastWorkerFailure:null,lastRendererCrash:null,session:null};
    this.previousUnclean=false;
    this.safeModeRequested=process.argv.includes('--safe-mode');
    this.heartbeatTimer=null;
    this.fatalHandling=false;
    this.sessionWrite=Promise.resolve();
  }

  async init(){
    try{
      const parsed=JSON.parse(await fsp.readFile(this.statePath,'utf8'));
      if(parsed&&typeof parsed==='object') this.state={...this.state,...parsed};
    }catch{}
    this.state.crashTimes=pruneTimes(this.state.crashTimes,10*60*1000);
    this.state.rendererCrashTimes=pruneTimes(this.state.rendererCrashTimes,10*60*1000);
    const old=this.state.session;
    this.previousUnclean=Boolean(old && old.cleanExit===false && Number(old.pid)!==process.pid);
    if(this.previousUnclean) this.state.recoveries=Number(this.state.recoveries||0)+1;
    if(this.previousUnclean && pruneTimes(this.state.crashTimes,5*60*1000).length>=3) this.safeModeRequested=true;
    this.state.session={id:uid('runtime'),pid:process.pid,startedAt:nowIso(),lastHeartbeatAt:nowIso(),cleanExit:false,safeMode:Boolean(this.safeModeRequested),previousSessionId:old?.id||''};
    await this._persist();
    this.heartbeatTimer=setInterval(()=>this.heartbeat().catch(()=>{}),this.heartbeatMs);
    this.heartbeatTimer.unref?.();
    if(this.previousUnclean) this.onEvent('Recovery Guard','تم اكتشاف إغلاق غير نظيف سابقًا. تم الحفاظ على Checkpoints وQueue وسيتم الاستئناف بأمان.','pending','system');
    if(this.safeModeRequested) this.onEvent('Recovery Guard','SAFE MODE فعال: Scheduler موقوف مؤقتًا حتى تراجعه يدويًا.','pending','system');
    return this.status();
  }

  isSafeMode(){ return Boolean(this.safeModeRequested); }

  async _persist(){
    if(!this.statePath)return;
    await fsp.mkdir(path.dirname(this.statePath),{recursive:true});
    const tmp=`${this.statePath}.tmp`;
    await fsp.writeFile(tmp,JSON.stringify(this.state,null,2),'utf8');
    try{await fsp.rename(tmp,this.statePath);}catch{await fsp.copyFile(tmp,this.statePath);await fsp.unlink(tmp).catch(()=>{});}
  }

  _persistSync(){
    if(!this.statePath)return;
    try{fs.mkdirSync(path.dirname(this.statePath),{recursive:true});fs.writeFileSync(this.statePath,JSON.stringify(this.state,null,2),'utf8');}catch{}
  }

  async heartbeat(){
    if(!this.state.session)return;
    this.state.session.lastHeartbeatAt=nowIso();
    await this._persist();
  }

  markCleanExitSync(){
    if(this.heartbeatTimer){clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;}
    if(this.state.session){this.state.session.cleanExit=true;this.state.session.finishedAt=nowIso();this.state.session.lastHeartbeatAt=nowIso();}
    this.state.crashTimes=[]; this.state.rendererCrashTimes=[];
    this._persistSync();
  }

  async _updateUiSession(mutator){
    let output=null;
    this.sessionWrite=this.sessionWrite.then(async()=>{
      let current={};
      try{current=JSON.parse(await fsp.readFile(this.sessionPath,'utf8'))||{};}catch{}
      const next=await mutator(current||{});
      await fsp.mkdir(path.dirname(this.sessionPath),{recursive:true});
      const tmp=`${this.sessionPath}.tmp`;
      await fsp.writeFile(tmp,JSON.stringify(next,null,2),'utf8');
      try{await fsp.rename(tmp,this.sessionPath);}catch{await fsp.copyFile(tmp,this.sessionPath);await fsp.unlink(tmp).catch(()=>{});}
      output=next;
    });
    await this.sessionWrite;
    return output;
  }

  async saveUiSession(input={}){
    if(!this.sessionPath)return {success:false,error:'Session path is not configured.'};
    const allowedModes=new Set(['chat','research','office','knowledge','memory','workflow','automation','code']);
    const next=await this._updateUiSession(previous=>({
      version:1,
      updatedAt:nowIso(),
      mode:allowedModes.has(String(input.mode||''))?String(input.mode):'chat',
      workspace:clean(input.workspace,3000),
      rightTab:['activity','files','sources'].includes(String(input.rightTab||''))?String(input.rightTab):'activity',
      selectedModel:clean(input.selectedModel||'auto',200),
      codeFile:clean(input.codeFile||'',3000),
      ...(previous.window?{window:previous.window}:{})
    }));
    return {success:true,session:next};
  }

  async loadUiSession(){
    try{await this.sessionWrite;}catch{}
    try{
      const j=JSON.parse(await fsp.readFile(this.sessionPath,'utf8'));
      return {success:true,session:j||null,safeMode:this.isSafeMode()};
    }catch{return {success:true,session:null,safeMode:this.isSafeMode()};}
  }

  async clearUiSession(){
    try{await fsp.unlink(this.sessionPath);}catch{}
    return {success:true};
  }

  async saveWindowState(win){
    if(!win||win.isDestroyed?.())return {success:false};
    try{
      const b=win.getBounds();
      const state={bounds:{x:Number(b.x),y:Number(b.y),width:Number(b.width),height:Number(b.height)},maximized:Boolean(win.isMaximized?.()),updatedAt:nowIso()};
      await this._updateUiSession(current=>({...current,window:state,version:1,updatedAt:nowIso()}));
      return {success:true,window:state};
    }catch{return {success:false};}
  }

  async windowState(){
    const r=await this.loadUiSession();
    const w=r?.session?.window;
    if(!w?.bounds)return null;
    const b=w.bounds;
    if(!Number.isFinite(Number(b.width))||!Number.isFinite(Number(b.height))||Number(b.width)<700||Number(b.height)<500)return null;
    return clone(w);
  }

  async reportWorkerFailure(worker,error,meta={}){
    const e=errorShape(error);
    this.state.workerFailures=Number(this.state.workerFailures||0)+1;
    this.state.lastWorkerFailure={at:nowIso(),worker:clean(worker,200),error:e,meta:safeObject(meta)};
    await this._persist().catch(()=>{});
    this.onEvent('Worker Guard',`${clean(worker,120)}: ${e.message}`,'error','system');
    return {success:true};
  }

  async reportNonFatal(origin,error,meta={}){
    const e=errorShape(error);
    await this._writeCrashReport({fatal:false,origin,error:e,meta:safeObject(meta)});
    this.onEvent('Recovery Guard',`${clean(origin,120)}: ${e.message}`,'error','system');
    return {success:true};
  }

  async handleRendererGone(details={}){
    const at=Date.now();
    this.state.rendererCrashTimes=pruneTimes([...(this.state.rendererCrashTimes||[]),at],5*60*1000);
    this.state.lastRendererCrash={at:nowIso(),reason:clean(details.reason||'',120),exitCode:Number(details.exitCode||0)};
    await this._writeCrashReport({fatal:false,origin:'renderer-process-gone',error:{name:'RendererCrash',message:`${details.reason||'unknown'} (${details.exitCode??''})`,stack:''},meta:details});
    const count=this.state.rendererCrashTimes.length;
    if(count<=3){
      this.state.rendererRestarts=Number(this.state.rendererRestarts||0)+1;
      await this._persist().catch(()=>{});
      this.onEvent('Renderer Watchdog',`Renderer توقف (${details.reason||'unknown'}). إعادة تشغيل الواجهة ${count}/3…`,'pending','system');
      setTimeout(()=>{try{this.onRecoverRenderer({attempt:count,details});}catch{}},Math.min(3000,500*count));
      return {success:true,restart:true,count};
    }
    this.safeModeRequested=true;
    if(this.state.session)this.state.session.safeMode=true;
    await this._persist().catch(()=>{});
    this.onEvent('Renderer Watchdog','تكرر انهيار الواجهة. تم تفعيل SAFE MODE وإيقاف إعادة التشغيل التلقائي للواجهة.','error','system');
    return {success:false,restart:false,count,safeMode:true};
  }

  handleFatal(error,origin='uncaughtException'){
    if(this.fatalHandling)return {success:false,alreadyHandling:true};
    this.fatalHandling=true;
    const e=errorShape(error);
    const at=Date.now();
    const recent=pruneTimes([...(this.state.crashTimes||[]),at],5*60*1000);
    this.state.crashTimes=recent;
    this.state.lastCrash={at:nowIso(),origin:clean(origin,120),error:e};
    if(this.state.session){this.state.session.cleanExit=false;this.state.session.lastFatalAt=nowIso();}
    const safeMode=recent.length>=3;
    if(safeMode){this.safeModeRequested=true;if(this.state.session)this.state.session.safeMode=true;}
    this._writeCrashReportSync({fatal:true,origin,error:e,meta:{crashCount5m:recent.length,safeMode}});
    this._persistSync();
    if(!this.terminateOnFatal)return {success:true,relaunch:recent.length<=4,safeMode,count:recent.length};
    try{
      if(recent.length<=4 && this.app?.relaunch){
        const base=process.argv.slice(1).filter(x=>x!=='--safe-mode'&&x!=='--recovered-crash');
        const args=[...base,'--recovered-crash'];
        if(safeMode)args.push('--safe-mode');
        this.app.relaunch({args});
      }
    }catch{}
    setTimeout(()=>{try{this.app?.exit?.(1);}catch{process.exit(1);}},250);
    return {success:true,relaunch:recent.length<=4,safeMode,count:recent.length};
  }

  async _writeCrashReport(payload){
    if(!this.crashDir)return;
    try{
      await fsp.mkdir(this.crashDir,{recursive:true});
      const file=path.join(this.crashDir,`crash-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}.json`);
      const safe=safeObject({at:nowIso(),pid:process.pid,platform:process.platform,arch:process.arch,node:process.version,...payload});
      await fsp.writeFile(file,JSON.stringify(safe,null,2),'utf8');
      return file;
    }catch{return '';}
  }

  _writeCrashReportSync(payload){
    if(!this.crashDir)return '';
    try{
      fs.mkdirSync(this.crashDir,{recursive:true});
      const file=path.join(this.crashDir,`crash-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}.json`);
      const safe=safeObject({at:nowIso(),pid:process.pid,platform:process.platform,arch:process.arch,node:process.version,...payload});
      fs.writeFileSync(file,JSON.stringify(safe,null,2),'utf8');
      return file;
    }catch{return '';}
  }

  async listCrashReports(limit=50){
    if(!this.crashDir)return {success:true,reports:[]};
    try{
      await fsp.mkdir(this.crashDir,{recursive:true});
      const rows=[];
      for(const e of await fsp.readdir(this.crashDir,{withFileTypes:true})) if(e.isFile()&&e.name.endsWith('.json')){
        const p=path.join(this.crashDir,e.name);const s=await fsp.stat(p);rows.push({name:e.name,path:p,size:s.size,modifiedAt:s.mtime.toISOString()});
      }
      return {success:true,reports:rows.sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt))).slice(0,Math.max(1,Math.min(200,Number(limit||50))))};
    }catch{return {success:true,reports:[]};}
  }

  status(){
    const crash5=pruneTimes(this.state.crashTimes,5*60*1000);
    const render5=pruneTimes(this.state.rendererCrashTimes,5*60*1000);
    return {
      success:true,
      safeMode:this.isSafeMode(),
      previousUnclean:this.previousUnclean,
      crashCount5m:crash5.length,
      rendererCrashCount5m:render5.length,
      rendererRestarts:Number(this.state.rendererRestarts||0),
      workerFailures:Number(this.state.workerFailures||0),
      recoveries:Number(this.state.recoveries||0),
      lastCrash:this.state.lastCrash||null,
      lastRendererCrash:this.state.lastRendererCrash||null,
      lastWorkerFailure:this.state.lastWorkerFailure||null,
      session:clone(this.state.session),
      statePath:this.statePath,
      sessionPath:this.sessionPath,
      crashDir:this.crashDir
    };
  }

  destroy(){ if(this.heartbeatTimer){clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;} }
}

module.exports={RecoveryManager,pruneTimes,errorShape};
