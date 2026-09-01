const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const {EvaluationHarness}=require('../electron/evaluation-harness');
const {IntelligenceCore}=require('../electron/intelligence-core');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-release-gate-'));
  const settings={intelligenceAutoTeam:true,intelligenceMaxAgents:5,parallelCodingLanesEnabled:true,parallelCodingLaneCount:2,evaluationReleaseGateEnabled:true,evaluationRegressionThreshold:8};
  const agentIds=['orchestrator','coder','researcher','office','vision','data','reviewer','verifier'];
  const agents=agentIds.map(id=>({id,label:id,modelKind:id==='coder'?'coding':id==='vision'?'vision':'general',groups:[]}));
  const mainSource=await fsp.readFile(path.join(root,'electron','main.js'),'utf8');
  const toolNames=[...mainSource.matchAll(/tool\('([^']+)'/g)].map(m=>m[1]);
  const intel=new IntelligenceCore({storagePath:path.join(tmp,'intel.json'),getSettings:()=>settings,getResourceStatus:async()=>({}),getRegistry:()=>({agents,toolGroups:{},skills:[]})});
  await intel.init();
  const moduleNames=['intelligence-core.js','dag-executor.js','transaction-manager.js','worktree-manager.js','parallel-lane-manager.js','resource-governor.js','recovery-manager.js'];
  const moduleReady=Object.fromEntries(moduleNames.map(n=>[n,fs.existsSync(path.join(root,'electron',n))]));
  const harness=new EvaluationHarness({
    storagePath:path.join(tmp,'eval.json'),getSettings:()=>settings,planner:p=>intel.plan(p),getRegistry:()=>intel.registry(),getToolNames:()=>toolNames,
    getModels:async()=>[{name:'release-gate-offline'}],protectedModels:['qwen3-coder:30b'],
    getSubsystemStatus:async()=>({intelligence:moduleReady['intelligence-core.js'],dag:moduleReady['dag-executor.js'],transactions:moduleReady['transaction-manager.js'],worktrees:moduleReady['worktree-manager.js'],lanes:moduleReady['parallel-lane-manager.js'],resources:moduleReady['resource-governor.js'],recovery:moduleReady['recovery-manager.js']})
  });
  await harness.init();
  const result=await harness.run({liveModels:false});
  const outDir=path.join(root,'.abdulkarem-eval');await fsp.mkdir(outDir,{recursive:true});
  const out=path.join(outDir,'release-gate.json');await fsp.writeFile(out,JSON.stringify(result,null,2),'utf8');
  console.log(`ABDULKAREM AI X v2.5 Release Gate: ${result.releaseGate.status} · ${result.score}% · ${result.passed}/${result.total}`);
  console.log(`Report: ${out}`);
  await fsp.rm(tmp,{recursive:true,force:true});
  if(result.releaseGate.status==='BLOCK')process.exit(2);
})().catch(e=>{console.error(e);process.exit(1);});
