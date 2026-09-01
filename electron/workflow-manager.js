const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const WORKFLOW_STATES = Object.freeze({
  DRAFT:'draft', READY:'ready', RUNNING:'running', WAITING_APPROVAL:'waiting_approval',
  PAUSED:'paused', COMPLETED:'completed', FAILED:'failed', CANCELLED:'cancelled'
});
const STEP_STATES = Object.freeze({
  PENDING:'pending', RUNNING:'running', WAITING_APPROVAL:'waiting_approval', COMPLETED:'completed',
  FAILED:'failed', SKIPPED:'skipped'
});

const TEMPLATES = Object.freeze({
  coding_repair: {
    label:'Coding Repair & Verify',
    description:'Inspect → Agent repair → Build/Test → Git status → checkpoint',
    requiresWorkspace:true,
    build:({goal}) => [
      {type:'project_inspect', label:'Inspect project'},
      {type:'agent', label:'Repair / implement', input:{mode:'code', teamMode:true, prompt:goal || 'افحص المشروع وأصلح الأخطاء ثم تحقق من النتيجة.'}},
      {type:'project_check', label:'Build / typecheck / tests', input:{includeTests:true}},
      {type:'git_status', label:'Review Git state'},
      {type:'checkpoint', label:'Verified checkpoint'}
    ]
  },
  code_release_preview: {
    label:'Code → Verify → Preview Deploy',
    description:'Agent work → checks → Git review → Vercel preview proposal (approval-gated)',
    requiresWorkspace:true,
    build:({goal}) => [
      {type:'project_inspect', label:'Inspect project'},
      {type:'agent', label:'Implement requested change', input:{mode:'code', teamMode:true, prompt:goal || 'نفّذ المطلوب في المشروع بجودة Production ثم تحقق من النتيجة.'}},
      {type:'project_check', label:'Build / typecheck / tests', input:{includeTests:true}},
      {type:'git_status', label:'Review Git state'},
      {type:'integration_proposal', label:'Vercel Preview approval', input:{provider:'vercel', action:'deploy_preview'}},
      {type:'checkpoint', label:'Release preview checkpoint'}
    ]
  },
  quality_gate: {
    label:'Project Quality Gate',
    description:'Inspect → Build/Test → Git state; read-only project validation',
    requiresWorkspace:true,
    build:() => [
      {type:'project_inspect', label:'Inspect project'},
      {type:'project_check', label:'Build / typecheck / tests', input:{includeTests:true}},
      {type:'git_status', label:'Review Git state'},
      {type:'checkpoint', label:'Quality checkpoint'}
    ]
  },
  research_report: {
    label:'Research → Synthesis',
    description:'Deep research agent → final verification checkpoint',
    requiresWorkspace:false,
    build:({goal}) => [
      {type:'agent', label:'Deep research', input:{mode:'research', teamMode:true, prompt:goal || 'ابحث بعمق في الموضوع وقدّم تقريرًا موثقًا بالمصادر.'}},
      {type:'checkpoint', label:'Research checkpoint'}
    ]
  }
});

function nowIso(){ return new Date().toISOString(); }
function id(prefix='wf'){ return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`; }
function cleanText(v,max=12000){ return String(v ?? '').replace(/\u0000/g,'').trim().slice(0,max); }
function outputForStorage(value){
  if (value == null) return null;
  let safe=value;
  try { safe=JSON.parse(JSON.stringify(value)); } catch { safe={text:String(value)}; }
  const raw=JSON.stringify(safe);
  if (raw.length<=30000) return safe;
  return {truncated:true, preview:raw.slice(0,30000)};
}
function publicWorkflow(w){ return JSON.parse(JSON.stringify(w)); }

class WorkflowManager {
  constructor({storagePath,onEvent,executeStep}={}){
    this.storagePath=storagePath;
    this.onEvent=typeof onEvent==='function'?onEvent:()=>{};
    this.executeStep=typeof executeStep==='function'?executeStep:async()=>({success:false,error:'Workflow executor is not configured.'});
    this.workflows=new Map();
    this.running=new Set();
    this.loaded=false;
  }

  async init(){
    if(this.loaded)return;
    this.loaded=true;
    try{
      const parsed=JSON.parse(await fsp.readFile(this.storagePath,'utf8'));
      for(const row of Array.isArray(parsed?.workflows)?parsed.workflows:[]){
        if(!row?.id)continue;
        if(row.status===WORKFLOW_STATES.RUNNING || row.status===WORKFLOW_STATES.WAITING_APPROVAL){
          row.status=WORKFLOW_STATES.PAUSED;
          row.pauseReason='Application restarted before this workflow finished.';
          const step=row.steps?.[row.cursor||0];
          if(step && (step.status===STEP_STATES.RUNNING || step.status===STEP_STATES.WAITING_APPROVAL)){
            step.status=STEP_STATES.PENDING;
            step.approvalId='';
            step.error='Previous execution was interrupted; resume will retry this step.';
          }
          row.updatedAt=nowIso();
        }
        this.workflows.set(row.id,row);
      }
      await this._persist();
    }catch{}
  }

  templates(){
    return Object.entries(TEMPLATES).map(([key,t])=>({key,label:t.label,description:t.description,requiresWorkspace:t.requiresWorkspace}));
  }

  async _persist(){
    if(!this.storagePath)return;
    await fsp.mkdir(path.dirname(this.storagePath),{recursive:true});
    const tmp=`${this.storagePath}.tmp`;
    const rows=[...this.workflows.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,200);
    await fsp.writeFile(tmp,JSON.stringify({version:1,updatedAt:nowIso(),workflows:rows},null,2),'utf8');
    try{await fsp.rename(tmp,this.storagePath);}catch{await fsp.copyFile(tmp,this.storagePath);await fsp.unlink(tmp).catch(()=>{});}
  }

  _event(w,detail,status='running'){
    this.onEvent(`Workflow · ${w.name}`,detail,status,'workflow');
  }

  async create(payload={}){
    await this.init();
    const templateKey=String(payload.template||'coding_repair');
    const template=TEMPLATES[templateKey];
    if(!template)return {success:false,error:'Unknown workflow template.'};
    const workspace=cleanText(payload.workspace||'',2000);
    if(template.requiresWorkspace && !workspace)return {success:false,error:'This workflow template requires a Workspace.'};
    if(workspace){ try{if(!(await fsp.stat(workspace)).isDirectory())throw new Error();}catch{return {success:false,error:'Workspace directory does not exist.'};} }
    const goal=cleanText(payload.goal||'',12000);
    const name=cleanText(payload.name||template.label,180)||template.label;
    const steps=template.build({goal,workspace}).map((s,index)=>({
      id:id('step'),index,type:s.type,label:s.label||s.type,input:s.input||{},status:STEP_STATES.PENDING,
      attempts:0,startedAt:'',finishedAt:'',error:'',output:null,approvalId:''
    }));
    const createdAt=nowIso();
    const w={
      id:id('wf'),name,template:templateKey,goal,workspace,status:WORKFLOW_STATES.READY,cursor:0,
      createdAt,updatedAt:createdAt,startedAt:'',finishedAt:'',pauseReason:'',error:'',steps,checkpoints:[],revision:1
    };
    this.workflows.set(w.id,w); await this._persist(); this._event(w,'تم إنشاء Workflow وهو جاهز للتشغيل','done');
    return {success:true,workflow:publicWorkflow(w)};
  }

  async list(){
    await this.init();
    return {success:true,templates:this.templates(),workflows:[...this.workflows.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(publicWorkflow)};
  }
  async get(workflowId){ await this.init(); const w=this.workflows.get(String(workflowId||'')); return w?{success:true,workflow:publicWorkflow(w)}:{success:false,error:'Workflow not found.'}; }

  async start(workflowId){
    await this.init(); const w=this.workflows.get(String(workflowId||''));
    if(!w)return {success:false,error:'Workflow not found.'};
    if([WORKFLOW_STATES.COMPLETED,WORKFLOW_STATES.CANCELLED].includes(w.status))return {success:false,error:`Workflow is ${w.status}.`};
    if(this.running.has(w.id))return {success:true,workflow:publicWorkflow(w),alreadyRunning:true};
    if(!w.startedAt)w.startedAt=nowIso();
    w.status=WORKFLOW_STATES.RUNNING; w.pauseReason=''; w.error=''; w.updatedAt=nowIso(); await this._persist();
    this._run(w.id).catch(()=>{});
    return {success:true,workflow:publicWorkflow(w)};
  }

  async pause(workflowId,reason='Paused by user'){
    await this.init(); const w=this.workflows.get(String(workflowId||'')); if(!w)return {success:false,error:'Workflow not found.'};
    if(w.status!==WORKFLOW_STATES.RUNNING)return {success:false,error:`Workflow is ${w.status}.`};
    w.status=WORKFLOW_STATES.PAUSED; w.pauseReason=cleanText(reason,500); w.updatedAt=nowIso(); await this._persist(); this._event(w,'تم إيقاف سير العمل مؤقتًا','done');
    return {success:true,workflow:publicWorkflow(w)};
  }

  async resume(workflowId){
    await this.init(); const w=this.workflows.get(String(workflowId||'')); if(!w)return {success:false,error:'Workflow not found.'};
    if(![WORKFLOW_STATES.PAUSED,WORKFLOW_STATES.FAILED,WORKFLOW_STATES.READY].includes(w.status))return {success:false,error:`Workflow cannot resume from ${w.status}.`};
    const step=w.steps[w.cursor];
    if(step?.status===STEP_STATES.FAILED){ step.status=STEP_STATES.PENDING; step.error=''; }
    return this.start(w.id);
  }

  async retry(workflowId){
    await this.init(); const w=this.workflows.get(String(workflowId||'')); if(!w)return {success:false,error:'Workflow not found.'};
    const step=w.steps[w.cursor]; if(!step)return {success:false,error:'No current step to retry.'};
    if(![STEP_STATES.FAILED,STEP_STATES.PENDING,STEP_STATES.WAITING_APPROVAL].includes(step.status))return {success:false,error:`Current step is ${step.status}.`};
    step.status=STEP_STATES.PENDING; step.error=''; step.approvalId=''; w.status=WORKFLOW_STATES.PAUSED; w.updatedAt=nowIso(); await this._persist();
    return this.resume(w.id);
  }

  async cancel(workflowId){
    await this.init(); const w=this.workflows.get(String(workflowId||'')); if(!w)return {success:false,error:'Workflow not found.'};
    if(w.status===WORKFLOW_STATES.COMPLETED)return {success:false,error:'Completed workflow cannot be cancelled.'};
    w.status=WORKFLOW_STATES.CANCELLED; w.finishedAt=nowIso(); w.updatedAt=nowIso(); await this._persist(); this._event(w,'تم إلغاء Workflow','done');
    return {success:true,workflow:publicWorkflow(w)};
  }

  async remove(workflowId){
    await this.init(); const idv=String(workflowId||''); const w=this.workflows.get(idv); if(!w)return {success:false,error:'Workflow not found.'};
    if(this.running.has(idv) || w.status===WORKFLOW_STATES.RUNNING)return {success:false,error:'Pause or cancel the workflow before deleting it.'};
    this.workflows.delete(idv); await this._persist(); return {success:true};
  }

  async notifyApproval(proposalId,result={}){
    await this.init(); const pid=String(proposalId||''); if(!pid)return {success:false,matched:false};
    for(const w of this.workflows.values()){
      const i=w.steps.findIndex(s=>s.approvalId===pid && s.status===STEP_STATES.WAITING_APPROVAL);
      if(i<0)continue;
      const step=w.steps[i];
      if(result?.success){
        step.status=STEP_STATES.COMPLETED; step.finishedAt=nowIso(); step.output=outputForStorage(result);
        w.cursor=i+1; w.status=WORKFLOW_STATES.PAUSED; w.pauseReason='Cloud approval executed; resuming next step.'; w.updatedAt=nowIso();
        this._addCheckpoint(w,i,'approval-executed'); await this._persist(); this._event(w,`اكتملت الموافقة: ${step.label}`,'done');
        return {success:true,matched:true,workflowId:w.id,resumeSuggested:true};
      }
      step.status=STEP_STATES.FAILED; step.finishedAt=nowIso(); step.error=cleanText(result?.error||'Cloud approval was rejected or failed.',2000); step.output=outputForStorage(result);
      w.status=WORKFLOW_STATES.FAILED; w.error=step.error; w.updatedAt=nowIso(); await this._persist(); this._event(w,`توقفت عند ${step.label}: ${step.error}`,'error');
      return {success:true,matched:true,workflowId:w.id,resumeSuggested:false};
    }
    return {success:true,matched:false};
  }

  _addCheckpoint(w,stepIndex,reason='step-completed'){
    const step=w.steps[stepIndex];
    w.checkpoints.push({id:id('cp'),at:nowIso(),reason,stepIndex,stepId:step?.id||'',stepLabel:step?.label||'',nextCursor:w.cursor,revision:w.revision});
    if(w.checkpoints.length>100)w.checkpoints=w.checkpoints.slice(-100);
  }

  async _run(workflowId){
    if(this.running.has(workflowId))return;
    this.running.add(workflowId);
    try{
      while(true){
        const w=this.workflows.get(workflowId); if(!w)break;
        if(w.status!==WORKFLOW_STATES.RUNNING)break;
        if(w.cursor>=w.steps.length){
          w.status=WORKFLOW_STATES.COMPLETED; w.finishedAt=nowIso(); w.updatedAt=nowIso(); w.error=''; await this._persist(); this._event(w,'اكتمل Workflow بالكامل','done'); break;
        }
        const step=w.steps[w.cursor];
        if(step.status===STEP_STATES.COMPLETED || step.status===STEP_STATES.SKIPPED){ w.cursor+=1; continue; }
        step.status=STEP_STATES.RUNNING; step.startedAt=nowIso(); step.finishedAt=''; step.error=''; step.attempts=(step.attempts||0)+1; w.updatedAt=nowIso(); await this._persist();
        this._event(w,`${w.cursor+1}/${w.steps.length} · ${step.label}`,'running');
        let result;
        try{ result=await this.executeStep({workflow:publicWorkflow(w),step:publicWorkflow(step)}); }
        catch(e){ result={success:false,error:e?.message||String(e)}; }
        const current=this.workflows.get(workflowId); if(!current)break;
        const liveStep=current.steps[current.cursor];
        if(current.status===WORKFLOW_STATES.CANCELLED)break;
        if(result?.waitingApproval){
          liveStep.status=STEP_STATES.WAITING_APPROVAL; liveStep.approvalId=String(result.approvalId||''); liveStep.output=outputForStorage(result);
          current.status=WORKFLOW_STATES.WAITING_APPROVAL; current.pauseReason='Human approval required'; current.updatedAt=nowIso(); await this._persist(); this._event(current,`بانتظار موافقتك: ${liveStep.label}`,'pending'); break;
        }
        if(result?.success===false){
          liveStep.status=STEP_STATES.FAILED; liveStep.finishedAt=nowIso(); liveStep.error=cleanText(result.error||'Step failed.',3000); liveStep.output=outputForStorage(result);
          current.status=WORKFLOW_STATES.FAILED; current.error=liveStep.error; current.updatedAt=nowIso(); await this._persist(); this._event(current,`فشل: ${liveStep.label} — ${liveStep.error}`,'error'); break;
        }
        liveStep.status=STEP_STATES.COMPLETED; liveStep.finishedAt=nowIso(); liveStep.output=outputForStorage(result); liveStep.error='';
        current.cursor+=1; current.updatedAt=nowIso(); current.revision=(current.revision||0)+1; this._addCheckpoint(current,current.cursor-1); await this._persist();
        if(current.status!==WORKFLOW_STATES.RUNNING)break;
      }
    }finally{ this.running.delete(workflowId); }
  }
}

module.exports={WorkflowManager,WORKFLOW_STATES,STEP_STATES,TEMPLATES};
