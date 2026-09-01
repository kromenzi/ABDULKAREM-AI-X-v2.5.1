const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const assert=require('assert');
const {EvaluationHarness}=require('../electron/evaluation-harness');
const {IntelligenceCore}=require('../electron/intelligence-core');

(async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-eval-'));
  const settings={intelligenceAutoTeam:true,intelligenceMaxAgents:5,parallelCodingLanesEnabled:true,parallelCodingLaneCount:2,evaluationReleaseGateEnabled:true,evaluationRegressionThreshold:8};
  const agents=['orchestrator','coder','researcher','office','vision','data','reviewer','verifier'].map(id=>({id,label:id,modelKind:id==='coder'?'coding':id==='vision'?'vision':'general',groups:[]}));
  const registry=()=>({agents,toolGroups:{},skills:[]});
  const intel=new IntelligenceCore({storagePath:path.join(dir,'intel.json'),getSettings:()=>settings,getResourceStatus:async()=>({}),getRegistry:registry});
  await intel.init();
  const toolNames=['read_file','write_file','edit_file','run_command','project_check','verify_project','git_diff','web_search','browse_webpage','deep_research','create_word_document','create_excel_workbook','create_powerpoint','analyze_file','ocr_document_pages','integration_propose'];
  const harness=new EvaluationHarness({
    storagePath:path.join(dir,'eval.json'),getSettings:()=>settings,planner:p=>intel.plan(p),getRegistry:()=>intel.registry(),getToolNames:()=>toolNames,
    getModels:async()=>[{name:'abdulkarem-general-sa:v2'},{name:'qwen3-coder:30b'}],protectedModels:['qwen3-coder:30b'],
    getSubsystemStatus:async()=>({intelligence:true,dag:true,transactions:true,worktrees:true,lanes:true,resources:true,recovery:true}),
    probeModel:async(model)=>({success:true,model,latencyMs:10,reply:'ABDX_OK'})
  });
  await harness.init();
  harness.recordToolResult('read_file',true,20);harness.recordToolResult('read_file',true,10);harness.recordToolResult('run_command',false,30);
  const run=await harness.run({liveModels:false});
  assert.equal(run.releaseGate.status,'PASS');
  assert.equal(run.score,100);
  assert(run.suites.find(s=>s.id==='planner-routing').score===100);
  assert(run.suites.find(s=>s.id==='safety-invariants').score===100);
  const baseline=await harness.promoteBaseline(run.id);
  assert.equal(baseline.id,run.id);
  const live=await harness.run({liveModels:true,modelNames:['qwen3-coder:30b']});
  assert.equal(live.releaseGate.status,'PASS');
  assert(live.suites.find(s=>s.id==='model-health').tests.some(t=>t.id.includes('qwen3-coder:30b')&&t.pass));
  const status=harness.status();
  assert(status.baseline);assert(status.toolMetrics.some(x=>x.name==='read_file'&&x.successRate===100));

  // Critical failure must block release.
  const bad=new EvaluationHarness({storagePath:path.join(dir,'bad.json'),getSettings:()=>settings,planner:p=>intel.plan(p),getRegistry:()=>({...intel.registry(),invariants:{}}),getToolNames:()=>toolNames.filter(x=>x!=='verify_project'),getModels:async()=>[{name:'x'}],protectedModels:[],getSubsystemStatus:async()=>({intelligence:true,dag:true,transactions:true,worktrees:true,lanes:true,resources:true,recovery:true})});
  await bad.init();
  const blocked=await bad.run();
  assert.equal(blocked.releaseGate.status,'BLOCK');

  await fsp.rm(dir,{recursive:true,force:true});
  console.log('evaluation-harness.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
