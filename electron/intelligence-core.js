const fs = require('fs');
const path = require('path');

function clamp(n,min,max){ return Math.max(min,Math.min(max,Number(n)||0)); }
function unique(xs=[]){ return [...new Set(xs.filter(Boolean))]; }
function nowIso(){ return new Date().toISOString(); }
function norm(s=''){ return String(s||'').toLowerCase(); }

const KEYWORDS = {
  coding:['code','bug','debug','build','test','react','node','python','typescript','javascript','api','backend','frontend','database','sql','git','terminal','powershell','compile','lint','runtime','برمج','كود','مشروع','خطأ','اصلح','أصلح','اختبار'],
  research:['research','search','latest','source','sources','verify','compare sources','بحث','مصادر','أحدث','احدث','تحقق','مقارنة مصادر'],
  office:['word','excel','powerpoint','docx','xlsx','xlsm','pptx','report','وورد','اكسل','إكسل','بوربوينت','تقرير','جدول'],
  vision:['image','photo','screenshot','ocr','vision','scan','صورة','صور','لقطة','مسح'],
  data:['data','csv','kpi','chart','statistics','analytics','dataset','بيانات','مؤشر','إحصاء','تحليل بيانات'],
  cloud:['github','vercel','supabase','deploy','deployment','push','pull request','pr ','cloud','نشر','جيت هب','فيرسل','سوبابيس'],
  automation:['schedule','scheduled','automation','automate','workflow','recurring','جدولة','أتمت','مجدول','سير العمل','دورية']
};

const AGENT_CAPS = {
  orchestrator:['general','planning','cloud','automation','memory','research'],
  coder:['coding','cloud','workspace','browser','git'],
  researcher:['research','sources','knowledge','web'],
  office:['office','documents','spreadsheets','slides'],
  vision:['vision','ocr','images'],
  data:['data','analytics','knowledge','spreadsheets'],
  reviewer:['review','consistency','risk'],
  verifier:['verification','evidence','completion']
};

class IntelligenceCore {
  constructor({storagePath='',getSettings=()=>({}),getResourceStatus=async()=>null,getRegistry=()=>({}),onEvent=()=>{}}={}){
    this.storagePath=storagePath;
    this.getSettings=getSettings;
    this.getResourceStatus=getResourceStatus;
    this.getRegistry=getRegistry;
    this.onEvent=onEvent;
    this.recentPlans=[];
    this.stats={plans:0,teamPlans:0,singlePlans:0,gateFailures:0,lastPlanAt:null};
  }

  async init(){
    try{
      const raw=await fs.promises.readFile(this.storagePath,'utf8');
      const state=JSON.parse(raw);
      this.recentPlans=Array.isArray(state.recentPlans)?state.recentPlans.slice(-50):[];
      this.stats={...this.stats,...(state.stats||{})};
    }catch{}
    return this.status();
  }

  async persist(){
    if(!this.storagePath)return;
    await fs.promises.mkdir(path.dirname(this.storagePath),{recursive:true});
    const tmp=`${this.storagePath}.tmp`;
    await fs.promises.writeFile(tmp,JSON.stringify({recentPlans:this.recentPlans.slice(-50),stats:this.stats},null,2),'utf8');
    try { await fs.promises.rename(tmp,this.storagePath); }
    catch { await fs.promises.copyFile(tmp,this.storagePath); await fs.promises.unlink(tmp).catch(()=>{}); }
  }

  registry(){
    const runtime=this.getRegistry()||{};
    const agents=Array.isArray(runtime.agents)?runtime.agents:[];
    const tools=runtime.toolGroups||{};
    const skills=Array.isArray(runtime.skills)?runtime.skills:[];
    return {
      version:'2.5.1',
      agents:agents.map(a=>({id:a.id,label:a.label,modelKind:a.modelKind,groups:a.groups||[],capabilities:unique([...(AGENT_CAPS[a.id]||[]),...(a.groups||[])])})),
      toolGroups:tools,
      skills:skills.map(s=>({name:s.name,agent:s.agent||'',tools:s.tools||[]})),
      invariants:{humanApprovalForCloudMutations:true,agentApprovalCapability:false,protectedModelDeletion:false,workspaceMutationLocks:true,parallelReadTasks:true,isolatedGitWorktrees:true,verifiedPatchMerge:true,parallelIsolatedCodingLanes:true,regionConflictDetection:true,releaseEvaluationGate:true}
    };
  }

  classify(payload={}){
    const mode=String(payload.mode||'chat');
    const text=norm([...(payload.messages||[])].reverse().find(m=>m?.role==='user')?.content||'');
    const attachments=(payload.attachmentPaths||[]).map(x=>norm(x));
    const hit=(kind)=>KEYWORDS[kind].some(k=>text.includes(norm(k)));
    const signals={
      coding:mode==='code'||hit('coding')||attachments.some(p=>/\.(js|jsx|ts|tsx|py|java|cs|cpp|c|go|rs|php|rb|sql|ps1|sh|json|ya?ml|toml)$/.test(p)),
      research:mode==='research'||hit('research'),
      office:mode==='office'||hit('office')||attachments.some(p=>/\.(docx?|xlsx?|xlsm|pptx?|csv|rtf|odt|ods|odp)$/.test(p)),
      vision:hit('vision')||attachments.some(p=>/\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(p)),
      data:hit('data')||attachments.some(p=>/\.(csv|xlsx?|xlsm|json|parquet)$/.test(p)),
      cloud:hit('cloud'),
      automation:mode==='workflow'||mode==='automation'||hit('automation')
    };
    const active=Object.entries(signals).filter(([,v])=>v).map(([k])=>k);
    const primary=signals.coding?'coding':signals.research?'research':signals.office?'office':signals.vision?'vision':signals.data?'data':'general';
    let complexity=1;
    complexity+=Math.max(0,active.length-1);
    if(text.length>1200)complexity+=1;
    if((payload.attachmentPaths||[]).length>=3)complexity+=1;
    if(payload.workspace)complexity+=1;
    if(signals.cloud||signals.automation)complexity+=1;
    return {primary,signals,active,complexity:clamp(complexity,1,6),textChars:text.length,attachments:(payload.attachmentPaths||[]).length};
  }

  scoreAgent(agentId,classification){
    const caps=AGENT_CAPS[agentId]||[];
    let fit=agentId==='orchestrator'?45:20;
    if(classification.primary==='general'&&agentId==='orchestrator')fit+=35;
    for(const signal of classification.active){ if(caps.includes(signal))fit+=24; }
    if(classification.primary==='coding'&&agentId==='coder')fit+=55;
    if(classification.primary==='research'&&agentId==='researcher')fit+=55;
    if(classification.primary==='office'&&agentId==='office')fit+=55;
    if(classification.primary==='vision'&&agentId==='vision')fit+=55;
    if(classification.primary==='data'&&agentId==='data')fit+=55;
    if(agentId==='reviewer'||agentId==='verifier')fit=15;
    return clamp(fit,0,100);
  }

  verificationGates(classification={}){
    const gates=[];
    if(classification.signals.coding)gates.push({id:'code-evidence',label:'Build/Test evidence',required:true,type:'execution'});
    if(classification.signals.research)gates.push({id:'source-evidence',label:'Source evidence',required:true,type:'sources'});
    if(classification.signals.office)gates.push({id:'artifact-evidence',label:'Office artifact evidence',required:true,type:'artifact'});
    if(classification.signals.cloud)gates.push({id:'human-approval',label:'Human approval for cloud mutation',required:true,type:'approval'});
    gates.push({id:'final-verification',label:'Independent verification',required:classification.complexity>=3,type:'verification'});
    return gates;
  }

  assignments(agentIds=[],classification={}){
    const map={
      orchestrator:'نسّق الهدف والقيود والاعتماديات. استخدم أقل مجموعة أدوات كافية، وركّز على التكامل بين الأجزاء.',
      coder:'نفّذ الجزء البرمجي فقط: افحص Root Cause، عدّل بأقل تغيير آمن، ثم Build/Test/Run/Browser verification عندما تنطبق.',
      researcher:'نفّذ جزء البحث فقط: اجمع أدلة ومصادر مناسبة، اكشف التعارضات، ولا تنفذ تعديلات برمجية.',
      office:'نفّذ جزء Office فقط باستخدام أدوات الملفات الفعلية، واحفظ Artifact قابل للتحقق بدل الاكتفاء بمحتوى المحادثة.',
      vision:'نفّذ التحليل البصري/OCR فقط، وافصل ما هو مرئي فعليًا عن أي استنتاج.',
      data:'نفّذ تحليل البيانات فقط: جودة البيانات، الحسابات، المؤشرات، ثم الاستنتاج مع فصل الحساب عن التفسير.',
      reviewer:'راجع مخرجات المتخصصين مقابل الطلب الأصلي، وابحث عن تناقضات أو ادعاءات بلا دليل. لا تعدّل الملفات.',
      verifier:'طبّق Completion Criteria وVerification Gates على الأدلة. لا تقبل نجاحًا تنفيذيًا بلا Evidence.'
    };
    return Object.fromEntries(agentIds.map(id=>[id,map[id]||`نفّذ تخصص ${id} فقط ضمن الهدف الأصلي.`]));
  }

  buildTaskGraph(agentIds=[],classification={}){
    const accessForAgent=(id)=>{
      if(['researcher','vision','reviewer','verifier'].includes(id))return {mode:'read',scope:id==='researcher'?'external':id==='vision'?'attachments':'workspace'};
      if(id==='data' && !classification.signals?.office)return {mode:'read',scope:'workspace'};
      return {mode:'write',scope:'workspace'};
    };
    const nodes=[{id:'understand',kind:'planner',label:'Understand & constrain',dependsOn:[],access:{mode:'none',scope:'planner'}}];
    const specialists=agentIds.filter(x=>!['reviewer','verifier'].includes(x));
    specialists.forEach((id,i)=>nodes.push({id:`agent-${i+1}`,kind:'agent',agent:id,label:`${id} execution`,dependsOn:['understand'],access:accessForAgent(id)}));
    const specialistNodeIds=nodes.filter(n=>n.kind==='agent').map(n=>n.id);
    if(agentIds.includes('reviewer'))nodes.push({id:'review',kind:'review',agent:'reviewer',label:'Independent review',dependsOn:specialistNodeIds.length?specialistNodeIds:['understand'],access:{mode:'read',scope:'evidence'}});
    if(agentIds.includes('verifier'))nodes.push({id:'verify',kind:'verify',agent:'verifier',label:'Verification gates',dependsOn:[agentIds.includes('reviewer')?'review':(specialistNodeIds.at(-1)||'understand')],access:{mode:'read',scope:'evidence'}});
    nodes.push({id:'synthesize',kind:'synthesis',label:'Final synthesis',dependsOn:[agentIds.includes('verifier')?'verify':agentIds.includes('reviewer')?'review':(specialistNodeIds.at(-1)||'understand')],access:{mode:'none',scope:'synthesis'}});
    const parallelReadNodes=nodes.filter(n=>n.kind==='agent'&&n.access?.mode==='read').map(n=>n.id);
    const mutationNodes=nodes.filter(n=>n.kind==='agent'&&n.access?.mode==='write').map(n=>n.id);
    return {nodes,edges:nodes.flatMap(n=>(n.dependsOn||[]).map(d=>({from:d,to:n.id}))),parallelSpecialists:specialists.length>1,parallelReadNodes,mutationNodes,mutationPolicy:'workspace-exclusive',classification:classification.primary};
  }

  estimate({classification,agentIds,resourceStatus}){
    const heavy=classification.primary==='coding'||classification.signals.vision;
    const agents=Math.max(1,agentIds.filter(x=>!['reviewer','verifier'].includes(x)).length);
    const queue=resourceStatus?.queue||{};
    const pressure=Number(resourceStatus?.ram?.pressure||resourceStatus?.pressure||0);
    const compute=clamp((heavy?52:28)+agents*12+(classification.complexity*6)+(pressure*24),10,100);
    const latency=clamp((heavy?48:24)+agents*14+(Number(queue.pending||0)*9)+(classification.complexity*5),8,100);
    return {computeScore:Math.round(compute),latencyScore:Math.round(latency),localMonetaryCost:0,pressure:Number.isFinite(pressure)?Number(pressure.toFixed(3)):0};
  }

  async plan(payload={}){
    const settings=this.getSettings()||{};
    const classification=this.classify(payload);
    const reg=this.registry();
    const candidates=reg.agents.filter(a=>!['reviewer','verifier'].includes(a.id)).map(a=>({id:a.id,label:a.label,score:this.scoreAgent(a.id,classification),modelKind:a.modelKind||'general'})).sort((a,b)=>b.score-a.score);
    const primary=candidates[0]||{id:'orchestrator',score:50,modelKind:'general'};
    const specialists=[primary.id];
    const signalAgents={coding:'coder',research:'researcher',office:'office',vision:'vision',data:'data'};
    const specialistCap=Math.max(1,Number(settings.intelligenceMaxAgents||3));
    for(const [signal,agentId] of Object.entries(signalAgents)){
      if(classification.signals[signal] && !specialists.includes(agentId) && candidates.some(c=>c.id===agentId) && specialists.length<specialistCap) specialists.push(agentId);
    }
    for(const c of candidates.slice(1)){
      if(c.score>=70 && specialists.length<specialistCap && !specialists.includes(c.id)) specialists.push(c.id);
    }
    if(classification.signals.cloud && !specialists.includes('orchestrator') && specialists.length<specialistCap) specialists.push('orchestrator');
    const forceTeam=payload.teamMode===true;
    const autoTeam=settings.intelligenceAutoTeam!==false && (classification.complexity>=3 || (classification.signals.coding && Boolean(payload.workspace)) || (classification.signals.research && classification.complexity>=2));
    const strategy=(forceTeam||autoTeam||specialists.length>1)?'team':'single';
    let agents=strategy==='team'?unique([...specialists,'reviewer','verifier']):[primary.id];
    const maxAgents=clamp(settings.intelligenceMaxAgents||5,1,5);
    if(strategy==='team'){
      const keepSpecialists=agents.filter(x=>!['reviewer','verifier'].includes(x)).slice(0,Math.max(1,maxAgents-2));
      agents=unique([...keepSpecialists,'reviewer','verifier']).slice(0,5);
    }
    const resources=await this.getResourceStatus().catch(()=>null);
    const gates=this.verificationGates(classification);
    const graph=this.buildTaskGraph(agents,classification);
    const assignments=this.assignments(agents,classification);
    const estimate=this.estimate({classification,agentIds:agents,resourceStatus:resources});
    const risk=classification.signals.cloud?'high':classification.signals.coding||classification.signals.office?'medium':'low';
    const specialistAgents=agents.filter(x=>!['reviewer','verifier'].includes(x));
    const codingLanes={
      eligible:settings.parallelCodingLanesEnabled!==false && strategy==='team' && classification.primary==='coding' && classification.complexity>=3 && specialistAgents.length>0 && specialistAgents.every(x=>x==='coder') && !classification.signals.research && !classification.signals.office && !classification.signals.vision && !classification.signals.data && !classification.signals.cloud && !classification.signals.automation,
      count:clamp(settings.parallelCodingLaneCount||2,2,3),
      conflictPolicy:'region-aware-fail-closed',
      mergePolicy:'disjoint-or-best-verified'
    };
    const plan={
      id:`plan_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      at:nowIso(),
      strategy,
      primaryAgent:primary.id,
      agents,
      modelKind:primary.modelKind||classification.primary,
      classification,
      candidates:candidates.slice(0,6),
      graph,
      assignments,
      gates,
      estimate,
      risk,
      codingLanes,
      rationale:`${classification.primary} · complexity ${classification.complexity}/6 · ${strategy} · primary ${primary.id}`
    };
    if(payload.__evaluation!==true){
      this.recentPlans.push({...plan,graph:{nodes:graph.nodes,edges:graph.edges}});
      this.recentPlans=this.recentPlans.slice(-50);
      this.stats.plans+=1; this.stats.lastPlanAt=plan.at;
      if(strategy==='team')this.stats.teamPlans+=1; else this.stats.singlePlans+=1;
      await this.persist().catch(()=>{});
      this.onEvent('Unified Planner',`${primary.id} · ${strategy} · risk ${risk} · compute ${estimate.computeScore}/100`,'done','planner');
    }
    return plan;
  }

  evaluate(plan,result={}){
    if(!plan)return {status:'UNPLANNED',score:0,gates:[],issues:['No intelligence plan.']};
    const verification=result.verification||{};
    const gates=(plan.gates||[]).map(g=>{
      let passed=true,reason='';
      if(g.id==='code-evidence'){
        passed=Number(verification.toolCalls||0)>0 && Number(verification.failed||0)===0 && Number(verification.score||0)>=85;
        reason=passed?'Execution evidence present.':'Coding execution is not fully verified.';
      }else if(g.id==='source-evidence'){
        passed=(result.researchSources||[]).length>0;
        reason=passed?'Research sources present.':'No source evidence returned.';
      }else if(g.id==='artifact-evidence'){
        passed=Number(verification.fileOperations||0)>0 || Number(verification.toolCalls||0)>0;
        reason=passed?'Artifact/tool evidence present.':'No artifact creation/edit evidence.';
      }else if(g.id==='human-approval'){
        const content=norm(result.content||'');
        passed=!/(deploy(ed)?|push(ed)?|db push.*(done|success)|تم النشر|تم الرفع)/i.test(content) || Number(verification.toolCalls||0)>0;
        reason=passed?'No unsupported cloud completion claim.':'Cloud completion claim lacks evidence.';
      }else if(g.id==='final-verification'){
        passed=Number(verification.score||0)>=80 || result.agents?.mode==='team';
        reason=passed?'Verification threshold met.':'Verification threshold not met.';
      }
      return {...g,passed,reason};
    });
    const failed=gates.filter(g=>g.required&&g.passed===false);
    const base=Number(verification.score||70);
    const score=clamp(base-(failed.length*12),0,100);
    const status=failed.length?'PARTIAL':score>=90?'VERIFIED':'ACCEPTABLE';
    if(failed.length)this.stats.gateFailures+=failed.length;
    this.persist().catch(()=>{});
    return {status,score,gateFailures:failed.length,gates,issues:failed.map(g=>g.reason),planId:plan.id};
  }

  status(){
    const reg=this.registry();
    return {
      success:true,version:'2.5.1',enabled:this.getSettings()?.intelligenceEnabled!==false,
      registry:reg,stats:{...this.stats},recentPlans:this.recentPlans.slice(-12).reverse(),
      policies:{autoTeam:this.getSettings()?.intelligenceAutoTeam!==false,maxAgents:Number(this.getSettings()?.intelligenceMaxAgents||5),verificationGate:this.getSettings()?.intelligenceVerificationGate!==false,parallelExecution:this.getSettings()?.intelligenceParallelExecution!==false,maxParallel:Number(this.getSettings()?.intelligenceMaxParallel||3),mutationLocks:true,parallelCodingLanes:this.getSettings()?.parallelCodingLanesEnabled!==false,laneCount:Number(this.getSettings()?.parallelCodingLaneCount||2),regionConflictDetection:true,releaseEvaluationGate:true}
    };
  }
}

module.exports={IntelligenceCore,AGENT_CAPS,KEYWORDS};
