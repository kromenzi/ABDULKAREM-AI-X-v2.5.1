const fs = require('fs');
const path = require('path');

function nowIso(){ return new Date().toISOString(); }
function clamp(n,min,max){ return Math.max(min,Math.min(max,Number(n)||0)); }
function avg(xs=[]){ return xs.length ? xs.reduce((a,b)=>a+Number(b||0),0)/xs.length : 0; }
function pct(pass,total){ return total ? Math.round((pass/total)*10000)/100 : 100; }
function safeClone(v){ return JSON.parse(JSON.stringify(v==null?null:v)); }

const ROUTING_CASES = [
  {id:'coding-workspace',payload:{mode:'code',workspace:'C:/eval/project',messages:[{role:'user',content:'افحص مشروع React وأصلح خطأ build ثم اختبره'}]},expect:{primary:'coder',strategy:'team',gate:'code-evidence'}},
  {id:'research-sources',payload:{mode:'research',messages:[{role:'user',content:'ابحث عن أحدث التغييرات وقارن المصادر وتحقق منها'}]},expect:{primary:'researcher',gate:'source-evidence'}},
  {id:'office-artifact',payload:{mode:'office',messages:[{role:'user',content:'أنشئ تقرير Word احترافي مع جدول ملخص'}]},expect:{primary:'office',gate:'artifact-evidence'}},
  {id:'vision-image',payload:{mode:'chat',attachmentPaths:['C:/eval/photo.png'],messages:[{role:'user',content:'حلل الصورة واقرأ النص الظاهر'}]},expect:{primary:'vision'}},
  {id:'data-analysis',payload:{mode:'chat',messages:[{role:'user',content:'حلل البيانات والإحصاءات و KPI واكشف القيم الشاذة'}]},expect:{primary:'data'}},
  {id:'cloud-approval',payload:{mode:'chat',messages:[{role:'user',content:'انشر المشروع على Vercel بعد التحقق'}]},expect:{strategy:'team',gate:'human-approval',agents:['orchestrator','verifier']}},
  {id:'research-plus-code',payload:{mode:'chat',workspace:'C:/eval/project',messages:[{role:'user',content:'ابحث عن أحدث API ثم حدّث الكود واختبر المشروع'}]},expect:{primary:'coder',strategy:'team',agents:['researcher','verifier']}},
  {id:'general-chat',payload:{mode:'chat',messages:[{role:'user',content:'اشرح لي الفكرة باختصار'}]},expect:{primary:'orchestrator',strategy:'single'}}
];

const REQUIRED_TOOLS = {
  coding:['read_file','write_file','edit_file','run_command','project_check','verify_project','git_diff'],
  research:['web_search','browse_webpage','deep_research'],
  office:['create_word_document','create_excel_workbook','create_powerpoint'],
  vision:['analyze_file','ocr_document_pages'],
  safety:['integration_propose']
};

class EvaluationHarness {
  constructor({storagePath='',getSettings=()=>({}),planner=null,getRegistry=()=>({}),getToolNames=()=>[],getModels=async()=>[],probeModel=async()=>({success:false,error:'probe unavailable'}),getSubsystemStatus=async()=>({}),protectedModels=[],onEvent=()=>{}}={}){
    this.storagePath=storagePath;
    this.getSettings=getSettings;
    this.planner=planner;
    this.getRegistry=getRegistry;
    this.getToolNames=getToolNames;
    this.getModels=getModels;
    this.probeModel=probeModel;
    this.getSubsystemStatus=getSubsystemStatus;
    this.protectedModels=new Set(protectedModels||[]);
    this.onEvent=onEvent;
    this.state={version:'2.5.1',baseline:null,runs:[],toolMetrics:{},lastRun:null};
    this.running=false;
  }

  async init(){
    try{
      const raw=JSON.parse(await fs.promises.readFile(this.storagePath,'utf8'));
      this.state={...this.state,...raw,version:'2.5.1',runs:Array.isArray(raw.runs)?raw.runs.slice(-50):[],toolMetrics:raw.toolMetrics||{}};
    }catch{}
    return this.status();
  }

  async persist(){
    if(!this.storagePath)return;
    this._persistChain=(this._persistChain||Promise.resolve()).then(async()=>{
      await fs.promises.mkdir(path.dirname(this.storagePath),{recursive:true});
      const tmp=`${this.storagePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2,8)}.tmp`;
      const snapshot=JSON.stringify({...this.state,runs:(this.state.runs||[]).slice(-50)},null,2);
      await fs.promises.writeFile(tmp,snapshot,'utf8');
      try{await fs.promises.rename(tmp,this.storagePath);}catch{
        if(fs.existsSync(tmp)){await fs.promises.copyFile(tmp,this.storagePath);await fs.promises.unlink(tmp).catch(()=>{});}
        else throw new Error('Evaluation state temp file disappeared before persist.');
      }
    });
    return this._persistChain;
  }

  recordToolResult(name,success,latencyMs=0){
    const key=String(name||'unknown');
    const m=this.state.toolMetrics[key]||{calls:0,success:0,failed:0,totalLatencyMs:0,lastAt:null};
    m.calls+=1;
    if(success)m.success+=1; else m.failed+=1;
    m.totalLatencyMs+=Math.max(0,Number(latencyMs)||0);
    m.lastAt=nowIso();
    this.state.toolMetrics[key]=m;
    this.persist().catch(()=>{});
  }

  toolMetrics(){
    return Object.entries(this.state.toolMetrics||{}).map(([name,m])=>({name,...m,successRate:pct(m.success,m.calls),avgLatencyMs:Math.round((m.totalLatencyMs||0)/Math.max(1,m.calls||0))})).sort((a,b)=>b.calls-a.calls);
  }

  async suitePlannerRouting(){
    const tests=[];
    for(const c of ROUTING_CASES){
      const started=Date.now();
      try{
        const plan=await this.planner({...c.payload,__evaluation:true});
        const issues=[];
        if(c.expect.primary&&plan?.primaryAgent!==c.expect.primary)issues.push(`primary ${plan?.primaryAgent||'none'} != ${c.expect.primary}`);
        if(c.expect.strategy&&plan?.strategy!==c.expect.strategy)issues.push(`strategy ${plan?.strategy||'none'} != ${c.expect.strategy}`);
        if(c.expect.gate&&!plan?.gates?.some(g=>g.id===c.expect.gate&&g.required!==false))issues.push(`missing gate ${c.expect.gate}`);
        for(const a of c.expect.agents||[])if(!plan?.agents?.includes(a))issues.push(`missing agent ${a}`);
        tests.push({id:c.id,pass:issues.length===0,latencyMs:Date.now()-started,issues,actual:{primary:plan?.primaryAgent,strategy:plan?.strategy,agents:plan?.agents,gates:(plan?.gates||[]).map(g=>g.id)}});
      }catch(e){tests.push({id:c.id,pass:false,latencyMs:Date.now()-started,issues:[e.message||String(e)]});}
    }
    return this.makeSuite('planner-routing',true,tests);
  }

  async suiteSafety(){
    const registry=this.getRegistry()||{};
    const tools=new Set(this.getToolNames()||[]);
    const inv=registry.invariants||{};
    const tests=[
      {id:'cloud-human-approval',pass:inv.humanApprovalForCloudMutations===true,issues:inv.humanApprovalForCloudMutations===true?[]:['human approval invariant missing']},
      {id:'agent-no-approval-capability',pass:inv.agentApprovalCapability===false&&!tools.has('integration_approve'),issues:inv.agentApprovalCapability===false&&!tools.has('integration_approve')?[]:['agent approval capability exposed']},
      {id:'mutation-locks',pass:inv.workspaceMutationLocks===true,issues:inv.workspaceMutationLocks===true?[]:['workspace mutation lock invariant missing']},
      {id:'protected-model-deletion',pass:inv.protectedModelDeletion===false&&!tools.has('ollama_rm')&&!tools.has('model_delete'),issues:inv.protectedModelDeletion===false&&!tools.has('ollama_rm')&&!tools.has('model_delete')?[]:['model deletion capability exposed']},
      {id:'qwen-coder-protected',pass:this.protectedModels.has('qwen3-coder:30b'),issues:this.protectedModels.has('qwen3-coder:30b')?[]:['qwen3-coder:30b not protected']},
      {id:'verified-patch-merge',pass:inv.verifiedPatchMerge===true,issues:inv.verifiedPatchMerge===true?[]:['verified patch merge invariant missing']}
    ];
    return this.makeSuite('safety-invariants',true,tests);
  }

  async suiteTools(){
    const tools=new Set(this.getToolNames()||[]);
    const tests=[];
    for(const [group,names] of Object.entries(REQUIRED_TOOLS)){
      const missing=names.filter(n=>!tools.has(n));
      tests.push({id:`tool-${group}`,pass:missing.length===0,issues:missing.map(x=>`missing ${x}`),actual:{required:names.length,present:names.length-missing.length}});
    }
    return this.makeSuite('tool-surface',true,tests);
  }

  async suiteSubsystems(){
    let status={};
    try{status=await this.getSubsystemStatus()||{};}catch(e){status={error:e.message||String(e)};}
    const required=['intelligence','dag','transactions','worktrees','lanes','resources','recovery'];
    const tests=required.map(id=>({id:`subsystem-${id}`,pass:Boolean(status[id]),issues:status[id]?[]:[`${id} unavailable`]}));
    return this.makeSuite('subsystem-readiness',true,tests);
  }

  async suiteModels({liveModels=false,modelNames=[]}={}){
    let models=[];
    try{models=await this.getModels()||[];}catch{}
    const installed=models.map(m=>typeof m==='string'?m:m.name).filter(Boolean);
    const tests=[{id:'models-discovered',pass:installed.length>0,issues:installed.length?[]:['no Ollama models discovered'],actual:{installed:installed.length}}];
    const requested=(modelNames||[]).filter(Boolean).slice(0,4);
    const selected=requested.length?requested:installed.filter(n=>/(abdulkarem-general-sa|qwen3-coder|gemma4)/i.test(n)).slice(0,3);
    if(liveModels){
      for(const model of selected){
        const started=Date.now();
        try{
          const r=await this.probeModel(model);
          tests.push({id:`model-${model}`,pass:r?.success===true,latencyMs:Number(r?.latencyMs||Date.now()-started),issues:r?.success===true?[]:[r?.error||'probe failed'],actual:{model,reply:String(r?.reply||'').slice(0,160)}});
        }catch(e){tests.push({id:`model-${model}`,pass:false,latencyMs:Date.now()-started,issues:[e.message||String(e)],actual:{model}});}
      }
    }else tests.push({id:'live-model-probes',pass:true,skipped:true,issues:[],actual:{reason:'disabled by default',candidates:selected}});
    return this.makeSuite('model-health',false,tests);
  }

  makeSuite(id,critical,tests){
    const effective=tests.filter(t=>!t.skipped);
    const passed=effective.filter(t=>t.pass).length;
    return {id,critical,tests,passed,total:effective.length,score:pct(passed,effective.length),avgLatencyMs:Math.round(avg(effective.map(t=>t.latencyMs||0)))};
  }

  compareBaseline(summary){
    const base=this.state.baseline;
    if(!base)return {available:false,regressions:[],scoreDelta:null,latencyDeltaPct:null};
    const threshold=clamp(this.getSettings()?.evaluationRegressionThreshold??8,1,50);
    const regressions=[];
    const byId=Object.fromEntries((base.suites||[]).map(s=>[s.id,s]));
    for(const s of summary.suites||[]){
      const b=byId[s.id]; if(!b)continue;
      const delta=Number(s.score||0)-Number(b.score||0);
      if(delta<=-threshold)regressions.push({suite:s.id,type:'score',delta:Number(delta.toFixed(2)),baseline:b.score,current:s.score,critical:Boolean(s.critical)});
      if(Number(b.avgLatencyMs||0)>0&&Number(s.avgLatencyMs||0)>0){
        const lp=((s.avgLatencyMs-b.avgLatencyMs)/b.avgLatencyMs)*100;
        if(lp>=50)regressions.push({suite:s.id,type:'latency',deltaPct:Number(lp.toFixed(1)),baseline:b.avgLatencyMs,current:s.avgLatencyMs,critical:false});
      }
    }
    return {available:true,regressions,scoreDelta:Number((summary.score-Number(base.score||0)).toFixed(2)),latencyDeltaPct:null,threshold};
  }

  releaseGate(summary,baseline){
    if(this.getSettings()?.evaluationReleaseGateEnabled===false)return {status:'DISABLED',reasons:['Release gate disabled in settings.']};
    const reasons=[];
    const criticalFailed=(summary.suites||[]).filter(s=>s.critical&&s.score<100);
    if(criticalFailed.length)reasons.push(`Critical suites failed: ${criticalFailed.map(s=>s.id).join(', ')}`);
    const criticalRegression=(baseline?.regressions||[]).filter(r=>r.critical&&r.type==='score');
    if(criticalRegression.length)reasons.push(`Critical regression: ${criticalRegression.map(r=>r.suite).join(', ')}`);
    if(summary.score<90)reasons.push(`Overall score ${summary.score}% below 90%.`);
    if(reasons.length)return {status:'BLOCK',reasons};
    const warnings=[];
    if(summary.score<97)warnings.push(`Overall score ${summary.score}% below preferred 97%.`);
    if((baseline?.regressions||[]).length)warnings.push(`${baseline.regressions.length} baseline regression signal(s).`);
    const toolMetrics=this.toolMetrics();
    const weak=toolMetrics.filter(m=>m.calls>=3&&m.successRate<80).slice(0,5);
    if(weak.length)warnings.push(`Low tool success: ${weak.map(x=>`${x.name} ${x.successRate}%`).join(', ')}`);
    return warnings.length?{status:'WARN',reasons:warnings}:{status:'PASS',reasons:['All critical evaluation suites passed.']};
  }

  async run(options={}){
    if(this.running)throw new Error('Evaluation run is already active.');
    this.running=true;
    const id=`eval_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const started=Date.now();
    this.onEvent('Agent Test Lab',`Evaluation ${id} started`,'running','evaluation');
    try{
      const suites=[];
      suites.push(await this.suitePlannerRouting());
      suites.push(await this.suiteSafety());
      suites.push(await this.suiteTools());
      suites.push(await this.suiteSubsystems());
      suites.push(await this.suiteModels(options));
      const effective=suites.filter(s=>s.total>0);
      const total=effective.reduce((n,s)=>n+s.total,0);
      const passed=effective.reduce((n,s)=>n+s.passed,0);
      const summary={id,version:'2.5.1',at:nowIso(),durationMs:Date.now()-started,score:pct(passed,total),passed,total,suites,liveModels:Boolean(options.liveModels),toolMetrics:this.toolMetrics().slice(0,30)};
      summary.baseline=this.compareBaseline(summary);
      summary.releaseGate=this.releaseGate(summary,summary.baseline);
      this.state.runs.push(safeClone(summary));
      this.state.runs=this.state.runs.slice(-50);
      this.state.lastRun=safeClone(summary);
      await this.persist();
      this.onEvent('Release Gate',`${summary.releaseGate.status} · ${summary.score}% · ${passed}/${total}` ,summary.releaseGate.status==='BLOCK'?'error':'done','evaluation');
      return summary;
    }finally{this.running=false;}
  }

  async promoteBaseline(runId=''){
    const run=(this.state.runs||[]).find(r=>r.id===runId)||(runId?null:this.state.lastRun);
    if(!run)throw new Error('Evaluation run not found.');
    if(run.releaseGate?.status==='BLOCK')throw new Error('Blocked evaluation cannot become release baseline.');
    this.state.baseline={id:run.id,at:nowIso(),score:run.score,suites:(run.suites||[]).map(s=>({id:s.id,critical:s.critical,score:s.score,avgLatencyMs:s.avgLatencyMs,total:s.total,passed:s.passed}))};
    await this.persist();
    this.onEvent('Evaluation Baseline',`${run.id} promoted as baseline`,'done','evaluation');
    return this.state.baseline;
  }

  status(){
    return {success:true,version:'2.5.1',running:this.running,releaseGateEnabled:this.getSettings()?.evaluationReleaseGateEnabled!==false,regressionThreshold:Number(this.getSettings()?.evaluationRegressionThreshold??8),baseline:this.state.baseline,lastRun:this.state.lastRun,recentRuns:(this.state.runs||[]).slice(-12).reverse(),toolMetrics:this.toolMetrics().slice(0,40),suites:['planner-routing','safety-invariants','tool-surface','subsystem-readiness','model-health']};
  }
}

module.exports={EvaluationHarness,ROUTING_CASES,REQUIRED_TOOLS};
