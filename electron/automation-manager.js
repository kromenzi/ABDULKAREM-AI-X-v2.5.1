const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const AUTOMATION_STATES = Object.freeze({ENABLED:'enabled',PAUSED:'paused'});
const RUN_STATES = Object.freeze({QUEUED:'queued',RUNNING:'running',WAITING_APPROVAL:'waiting_approval',RETRY_WAIT:'retry_wait',COMPLETED:'completed',FAILED:'failed',SKIPPED:'skipped',CANCELLED:'cancelled',INTERRUPTED:'interrupted'});

function nowIso(){ return new Date().toISOString(); }
function uid(prefix='auto'){ return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`; }
function clean(v,max=12000){ return String(v ?? '').replace(/\u0000/g,'').trim().slice(0,max); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function parseTime(v){ const m=/^(\d{1,2}):(\d{2})$/.exec(String(v||'')); if(!m)return null; const h=Number(m[1]),min=Number(m[2]); return h>=0&&h<=23&&min>=0&&min<=59?{h,min}:null; }

function normalizeSchedule(input={}){
  const type=['manual','once','interval','daily'].includes(String(input.type||''))?String(input.type):'manual';
  if(type==='once'){
    const d=new Date(input.onceAt||'');
    if(!Number.isFinite(d.getTime())) throw new Error('onceAt must be a valid date/time.');
    return {type,onceAt:d.toISOString()};
  }
  if(type==='interval'){
    const intervalMinutes=Math.max(5,Math.min(10080,Math.round(Number(input.intervalMinutes||60))));
    return {type,intervalMinutes};
  }
  if(type==='daily'){
    const t=parseTime(input.dailyTime||'08:00'); if(!t)throw new Error('dailyTime must use HH:MM.');
    return {type,dailyTime:`${String(t.h).padStart(2,'0')}:${String(t.min).padStart(2,'0')}`};
  }
  return {type:'manual'};
}

function nextForSchedule(schedule,fromMs=Date.now()){
  if(!schedule||schedule.type==='manual')return '';
  if(schedule.type==='once'){
    const t=new Date(schedule.onceAt).getTime(); return Number.isFinite(t)&&t>fromMs?new Date(t).toISOString():'';
  }
  if(schedule.type==='interval') return new Date(fromMs + Math.max(5,Number(schedule.intervalMinutes||60))*60000).toISOString();
  if(schedule.type==='daily'){
    const t=parseTime(schedule.dailyTime||'08:00'); if(!t)return '';
    const d=new Date(fromMs); d.setHours(t.h,t.min,0,0); if(d.getTime()<=fromMs)d.setDate(d.getDate()+1); return d.toISOString();
  }
  return '';
}

class AutomationManager {
  constructor({storagePath,workflowManager,onEvent,concurrency=1,tickMs=15000}={}){
    this.storagePath=storagePath;
    this.workflowManager=workflowManager;
    this.onEvent=typeof onEvent==='function'?onEvent:()=>{};
    this.concurrency=Math.max(1,Math.min(4,Number(concurrency||1)));
    this.tickMs=Math.max(5000,Number(tickMs||15000));
    this.automations=new Map();
    this.runs=new Map();
    this.queue=[];
    this.active=new Set();
    this.timer=null;
    this.loaded=false;
    this.stopped=false;
  }

  async init(){
    if(this.loaded)return;
    this.loaded=true;
    try{
      const parsed=JSON.parse(await fsp.readFile(this.storagePath,'utf8'));
      for(const a of Array.isArray(parsed?.automations)?parsed.automations:[]) if(a?.id)this.automations.set(a.id,a);
      for(const r of Array.isArray(parsed?.runs)?parsed.runs:[]) if(r?.id)this.runs.set(r.id,r);
    }catch{}
    // Recover open queue/workflow runs after an unclean shutdown. A run that already
    // owns a Workflow resumes that same Workflow/checkpoint instead of creating a new one.
    for(const r of this.runs.values()){
      if(![RUN_STATES.RUNNING,RUN_STATES.QUEUED,RUN_STATES.RETRY_WAIT,RUN_STATES.WAITING_APPROVAL].includes(r.status))continue;
      if(r.status===RUN_STATES.RETRY_WAIT && new Date(r.notBefore||0).getTime()>Date.now())continue;
      if(r.workflowId){
        const got=await this.workflowManager?.get?.(r.workflowId).catch(()=>null); const w=got?.workflow;
        if(w?.status==='completed'){r.status=RUN_STATES.COMPLETED;r.finishedAt=r.finishedAt||nowIso();r.error='';continue;}
        if(w?.status==='cancelled'){r.status=RUN_STATES.CANCELLED;r.finishedAt=r.finishedAt||nowIso();r.error='Workflow was cancelled before recovery.';continue;}
        if(w?.status==='waiting_approval'){
          r.status=RUN_STATES.WAITING_APPROVAL;r.error='Human approval required.';continue;
        }
        if(w && ['paused','ready','failed','running'].includes(w.status)){
          r.status=RUN_STATES.QUEUED;r.finishedAt='';r.error='';r.recoveryMode='resume';r.recoveredAt=nowIso();
          this.queue.push({runId:r.id,automationId:r.automationId,recovery:true});continue;
        }
      }
      r.status=RUN_STATES.QUEUED;r.finishedAt='';r.error='';r.recoveryMode='restart';r.recoveredAt=nowIso();
      this.queue.push({runId:r.id,automationId:r.automationId,recovery:true});
    }
    const now=Date.now();
    for(const a of this.automations.values()){
      if(a.state===AUTOMATION_STATES.ENABLED && a.schedule?.type!=='manual'){
        const due=new Date(a.nextRunAt||0).getTime();
        if(!Number.isFinite(due)||!a.nextRunAt) a.nextRunAt=nextForSchedule(a.schedule,now);
        else if(due<=now){
          // Catch up at most one missed occurrence after restart.
          this._enqueue(a.id,'catch-up');
          a.nextRunAt=nextForSchedule(a.schedule,now);
          if(a.schedule.type==='once') a.state=AUTOMATION_STATES.PAUSED;
        }
      }
    }
    await this._persist();
    this.startScheduler();
  }

  startScheduler(){
    if(this.timer)return;
    this.stopped=false;
    this.timer=setInterval(()=>this.tick().catch(()=>{}),this.tickMs);
    this.tick().catch(()=>{});
  }
  stopScheduler(){ this.stopped=true; if(this.timer){clearInterval(this.timer);this.timer=null;} }

  _event(a,detail,status='running'){
    this.onEvent(`Automation · ${a?.name||'Task'}`,detail,status,'automation');
  }

  async _persist(){
    if(!this.storagePath)return;
    await fsp.mkdir(path.dirname(this.storagePath),{recursive:true});
    const tmp=`${this.storagePath}.tmp`;
    const automations=[...this.automations.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,200);
    const runs=[...this.runs.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,500);
    await fsp.writeFile(tmp,JSON.stringify({version:1,updatedAt:nowIso(),automations,runs},null,2),'utf8');
    try{await fsp.rename(tmp,this.storagePath);}catch{await fsp.copyFile(tmp,this.storagePath);await fsp.unlink(tmp).catch(()=>{});}
  }

  status(){
    const autos=[...this.automations.values()];
    const runs=[...this.runs.values()];
    return {success:true,running:this.active.size,queued:this.queue.length,concurrency:this.concurrency,enabled:autos.filter(a=>a.state===AUTOMATION_STATES.ENABLED).length,total:autos.length,waitingApproval:runs.filter(r=>r.status===RUN_STATES.WAITING_APPROVAL).length};
  }

  async list(){ await this.init(); return {...this.status(),automations:[...this.automations.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(clone),runs:[...this.runs.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,150).map(clone)}; }
  async get(id){ await this.init(); const a=this.automations.get(String(id||'')); return a?{success:true,automation:clone(a),runs:[...this.runs.values()].filter(r=>r.automationId===a.id).sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt))).slice(0,100).map(clone)}:{success:false,error:'Automation not found.'}; }

  async create(payload={}){
    await this.init();
    if(!this.workflowManager)return {success:false,error:'Workflow Manager is not available.'};
    const schedule=normalizeSchedule(payload.schedule||{});
    if(schedule.type==='once' && new Date(schedule.onceAt).getTime()<=Date.now()) return {success:false,error:'Run-once time must be in the future.'};
    const template=clean(payload.template||'quality_gate',80);
    const workspace=clean(payload.workspace||'',2000);
    const goal=clean(payload.goal||'',12000);
    const name=clean(payload.name||`Scheduled ${template}`,180)||`Scheduled ${template}`;
    const maxAttempts=Math.max(1,Math.min(3,Math.round(Number(payload.retry?.maxAttempts||1))));
    const backoffMinutes=Math.max(1,Math.min(120,Math.round(Number(payload.retry?.backoffMinutes||5))));
    // Validate template/workspace by creating only at execution time, but ensure template exists now.
    const templates=this.workflowManager.templates?.()||[];
    const t=templates.find(x=>x.key===template);
    if(!t)return {success:false,error:'Unknown workflow template.'};
    if(t.requiresWorkspace&&!workspace)return {success:false,error:'Selected workflow template requires a Workspace.'};
    if(workspace){try{if(!(await fsp.stat(workspace)).isDirectory())throw new Error();}catch{return {success:false,error:'Workspace directory does not exist.'};}}
    const createdAt=nowIso();
    const a={id:uid('auto'),name,template,goal,workspace,state:payload.enabled===false?AUTOMATION_STATES.PAUSED:AUTOMATION_STATES.ENABLED,schedule,retry:{maxAttempts,backoffMinutes},createdAt,updatedAt:createdAt,lastRunAt:'',nextRunAt:'',lastRunStatus:'',runCount:0};
    if(a.state===AUTOMATION_STATES.ENABLED)a.nextRunAt=nextForSchedule(schedule,Date.now());
    this.automations.set(a.id,a); await this._persist(); this._event(a,'تم إنشاء Automation','done');
    return {success:true,automation:clone(a)};
  }

  async setEnabled(id,enabled){
    await this.init(); const a=this.automations.get(String(id||'')); if(!a)return {success:false,error:'Automation not found.'};
    a.state=enabled?AUTOMATION_STATES.ENABLED:AUTOMATION_STATES.PAUSED; a.updatedAt=nowIso();
    a.nextRunAt=enabled?nextForSchedule(a.schedule,Date.now()):'';
    await this._persist(); this._event(a,enabled?'تم تفعيل الجدولة':'تم إيقاف الجدولة مؤقتًا','done');
    return {success:true,automation:clone(a)};
  }

  async remove(id){
    await this.init(); const key=String(id||''); const a=this.automations.get(key); if(!a)return {success:false,error:'Automation not found.'};
    if([...this.runs.values()].some(r=>r.automationId===key&&[RUN_STATES.RUNNING,RUN_STATES.WAITING_APPROVAL].includes(r.status))) return {success:false,error:'Cannot delete an automation with an active/waiting run.'};
    this.automations.delete(key); this.queue=this.queue.filter(q=>q.automationId!==key); await this._persist(); return {success:true};
  }

  async runNow(id){ await this.init(); const a=this.automations.get(String(id||'')); if(!a)return {success:false,error:'Automation not found.'}; const r=this._enqueue(a.id,'manual'); await this._persist(); this._drain().catch(()=>{}); return r; }

  _hasOpenRun(automationId){ return [...this.runs.values()].some(r=>r.automationId===automationId&&[RUN_STATES.QUEUED,RUN_STATES.RUNNING,RUN_STATES.WAITING_APPROVAL,RUN_STATES.RETRY_WAIT].includes(r.status)); }

  _enqueue(automationId,trigger='schedule',attempt=1,notBefore=''){
    const a=this.automations.get(automationId); if(!a)return {success:false,error:'Automation not found.'};
    if(trigger!=='retry'&&this._hasOpenRun(automationId)){
      const r={id:uid('run'),automationId,automationName:a.name,workflowId:'',trigger,status:RUN_STATES.SKIPPED,attempt,createdAt:nowIso(),startedAt:'',finishedAt:nowIso(),error:'Skipped overlapping run; previous run is still open.',notBefore:'',result:null};
      this.runs.set(r.id,r); a.lastRunAt=r.finishedAt;a.lastRunStatus=r.status;a.runCount=(a.runCount||0)+1; return {success:true,run:clone(r),skipped:true};
    }
    const r={id:uid('run'),automationId,automationName:a.name,workflowId:'',trigger,status:notBefore?RUN_STATES.RETRY_WAIT:RUN_STATES.QUEUED,attempt,createdAt:nowIso(),startedAt:'',finishedAt:'',error:'',notBefore:notBefore||'',result:null};
    this.runs.set(r.id,r); this.queue.push({runId:r.id,automationId}); return {success:true,run:clone(r)};
  }

  async tick(){
    if(this.stopped)return;
    await this.init(); const now=Date.now();
    for(const a of this.automations.values()){
      if(a.state!==AUTOMATION_STATES.ENABLED||a.schedule?.type==='manual')continue;
      const due=new Date(a.nextRunAt||0).getTime();
      if(Number.isFinite(due)&&due<=now){
        this._enqueue(a.id,'schedule');
        if(a.schedule.type==='once'){a.state=AUTOMATION_STATES.PAUSED;a.nextRunAt='';}
        else a.nextRunAt=nextForSchedule(a.schedule,now);
        a.updatedAt=nowIso();
      }
    }
    // Retry jobs become queueable after backoff.
    for(const r of this.runs.values()){
      if(r.status===RUN_STATES.RETRY_WAIT&&new Date(r.notBefore||0).getTime()<=now){r.status=RUN_STATES.QUEUED;this.queue.push({runId:r.id,automationId:r.automationId});}
    }
    await this._refreshWaitingApprovals();
    await this._persist();
    this._drain().catch(()=>{});
  }

  async _refreshWaitingApprovals(){
    if(!this.workflowManager)return;
    for(const r of this.runs.values()){
      if(r.status!==RUN_STATES.WAITING_APPROVAL||!r.workflowId)continue;
      const got=await this.workflowManager.get(r.workflowId).catch(()=>null); const w=got?.workflow; if(!w)continue;
      if(w.status==='completed') await this._finishRun(r,RUN_STATES.COMPLETED,'',w);
      else if(w.status==='failed') await this._handleFailure(r,w.error||'Workflow failed after approval.',w);
      else if(w.status==='cancelled') await this._finishRun(r,RUN_STATES.CANCELLED,'Workflow was cancelled.',w);
      else if(w.status==='running'||w.status==='paused'){
        r.status=RUN_STATES.RUNNING; r.error=''; this.active.add(r.id); this._monitorWorkflow(r.id).catch(()=>{});
      }
    }
  }

  async _drain(){
    while(this.active.size<this.concurrency&&this.queue.length){
      const q=this.queue.shift(); const r=this.runs.get(q.runId); if(!r||r.status!==RUN_STATES.QUEUED)continue;
      this.active.add(r.id); this._executeRun(r.id).catch(()=>{});
    }
  }

  async _executeRun(runId){
    const r=this.runs.get(runId); if(!r){this.active.delete(runId);return;}
    const a=this.automations.get(r.automationId); if(!a){r.status=RUN_STATES.FAILED;r.error='Automation definition was deleted.';r.finishedAt=nowIso();this.active.delete(runId);await this._persist();return;}
    const recovering=Boolean(r.recoveryMode);
    r.status=RUN_STATES.RUNNING;r.startedAt=r.startedAt||nowIso();r.error='';a.lastRunAt=r.startedAt;a.lastRunStatus=r.status;
    if(!recovering)a.runCount=(a.runCount||0)+1;
    await this._persist();this._event(a,recovering?`استئناف Run بعد Recovery · attempt ${r.attempt}`:`بدء Run #${a.runCount} · attempt ${r.attempt}`,'running');
    try{
      if(r.recoveryMode==='resume' && r.workflowId){
        const got=await this.workflowManager.get(r.workflowId); const w=got?.workflow;
        if(!got?.success||!w)throw new Error('Could not restore the previous workflow checkpoint.');
        let started;
        if(w.status==='paused'||w.status==='failed'||w.status==='ready') started=await this.workflowManager.resume(r.workflowId);
        else if(w.status==='running') started={success:true,workflow:w,alreadyRunning:true};
        else if(w.status==='completed'){await this._finishRun(r,RUN_STATES.COMPLETED,'',w);return;}
        else started=await this.workflowManager.start(r.workflowId);
        if(!started?.success)throw new Error(started?.error||'Could not resume recovered workflow.');
      }else{
        const created=await this.workflowManager.create({template:a.template,name:`${a.name} · ${new Date().toLocaleString()}`,goal:a.goal,workspace:a.workspace});
        if(!created?.success)throw new Error(created?.error||'Could not create workflow.');
        r.workflowId=created.workflow.id;await this._persist();
        const started=await this.workflowManager.start(r.workflowId); if(!started?.success)throw new Error(started?.error||'Could not start workflow.');
      }
      r.recoveryMode='';await this._persist();
      await this._monitorWorkflow(r.id);
    }catch(e){ await this._handleFailure(r,e?.message||String(e),null); }
  }

  async _monitorWorkflow(runId){
    const r=this.runs.get(runId); if(!r)return;
    const a=this.automations.get(r.automationId);
    try{
      for(let i=0;i<86400;i++){
        if(!this.runs.has(runId))break;
        const got=await this.workflowManager.get(r.workflowId).catch(()=>null); const w=got?.workflow;
        if(!w){await this._handleFailure(r,'Workflow record disappeared.',null);break;}
        if(w.status==='completed'){await this._finishRun(r,RUN_STATES.COMPLETED,'',w);break;}
        if(w.status==='waiting_approval'){
          r.status=RUN_STATES.WAITING_APPROVAL;r.result={workflowStatus:w.status,cursor:w.cursor};r.error='Human approval required.';this.active.delete(r.id);if(a){a.lastRunStatus=r.status;a.updatedAt=nowIso();}await this._persist();this._event(a,'الخلفية توقفت عند Cloud Approval وتنتظر موافقتك','pending');this._drain().catch(()=>{});break;
        }
        if(w.status==='failed'){await this._handleFailure(r,w.error||'Workflow failed.',w);break;}
        if(w.status==='cancelled'){await this._finishRun(r,RUN_STATES.CANCELLED,'Workflow cancelled.',w);break;}
        if(w.status==='paused'){
          r.status=RUN_STATES.INTERRUPTED;r.finishedAt=nowIso();r.error=w.pauseReason||'Workflow paused.';this.active.delete(r.id);if(a){a.lastRunStatus=r.status;a.updatedAt=nowIso();}await this._persist();this._drain().catch(()=>{});break;
        }
        await sleep(1000);
      }
    }catch(e){await this._handleFailure(r,e?.message||String(e),null);}
  }

  async _handleFailure(r,error,workflow){
    const a=this.automations.get(r.automationId); const max=Math.max(1,Number(a?.retry?.maxAttempts||1));
    this.active.delete(r.id);
    if(a&&r.attempt<max){
      const backoff=Math.max(1,Number(a.retry?.backoffMinutes||5));
      r.status=RUN_STATES.FAILED;r.finishedAt=nowIso();r.error=clean(error,3000);r.result=workflow?{workflowStatus:workflow.status,cursor:workflow.cursor}:null;
      const next=new Date(Date.now()+backoff*60000).toISOString();
      const retry=this._enqueue(a.id,'retry',r.attempt+1,next);
      if(retry?.run){retry.run.parentRunId=r.id; const live=this.runs.get(retry.run.id); if(live)live.parentRunId=r.id;}
      a.lastRunStatus=RUN_STATES.RETRY_WAIT;a.updatedAt=nowIso();await this._persist();this._event(a,`فشل attempt ${r.attempt}. Retry بعد ${backoff} دقيقة`,'error');
    }else await this._finishRun(r,RUN_STATES.FAILED,error,workflow);
    this._drain().catch(()=>{});
  }

  async _finishRun(r,status,error='',workflow=null){
    const a=this.automations.get(r.automationId); this.active.delete(r.id);r.status=status;r.finishedAt=nowIso();r.error=clean(error,3000);r.result=workflow?{workflowStatus:workflow.status,cursor:workflow.cursor,finishedAt:workflow.finishedAt||''}:r.result;
    if(a){a.lastRunStatus=status;a.updatedAt=nowIso();}
    await this._persist();this._event(a,status===RUN_STATES.COMPLETED?'اكتمل Background Run':`${status}: ${r.error||''}`,status===RUN_STATES.COMPLETED?'done':status===RUN_STATES.CANCELLED?'done':'error');this._drain().catch(()=>{});
  }
}

module.exports={AutomationManager,AUTOMATION_STATES,RUN_STATES,normalizeSchedule,nextForSchedule};
