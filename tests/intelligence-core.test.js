const assert=require('assert');
const path=require('path');
const fs=require('fs');
const os=require('os');
const {IntelligenceCore}=require('../electron/intelligence-core');

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'abdx-intel-'));
  const settings={intelligenceAutoTeam:true,intelligenceMaxAgents:5};
  const core=new IntelligenceCore({
    storagePath:path.join(dir,'intel.json'),
    getSettings:()=>settings,
    getResourceStatus:async()=>({ram:{pressure:0.35},queue:{pending:0}}),
    getRegistry:()=>({
      agents:['orchestrator','coder','researcher','office','vision','data','reviewer','verifier'].map(id=>({id,label:id,modelKind:id==='coder'?'coding':id==='vision'?'vision':'general',groups:[]})),
      toolGroups:{workspace_read:4,workspace_write:2,research:4,office:8},skills:[]
    })
  });
  await core.init();
  const code=await core.plan({mode:'chat',workspace:'C:/x',messages:[{role:'user',content:'افحص مشروع React وأصلح build error ثم اختبره'}]});
  assert.equal(code.primaryAgent,'coder');
  assert.equal(code.modelKind,'coding');
  assert.ok(code.graph.nodes.some(n=>n.kind==='verify'));
  assert.ok(code.gates.some(g=>g.id==='code-evidence'));

  const research=await core.plan({mode:'research',messages:[{role:'user',content:'ابحث عن أحدث المصادر وقارنها'}]});
  assert.equal(research.primaryAgent,'researcher');
  assert.ok(research.gates.some(g=>g.id==='source-evidence'));

  const office=await core.plan({mode:'office',attachmentPaths:['report.xlsx'],messages:[{role:'user',content:'حلل الملف وسو تقرير'}]});
  assert.equal(office.primaryAgent,'office');

  const vision=await core.plan({mode:'chat',attachmentPaths:['screen.png'],messages:[{role:'user',content:'حلل الصورة'}]});
  assert.equal(vision.primaryAgent,'vision');


  const mixed=await core.plan({mode:'chat',workspace:'C:/x',messages:[{role:'user',content:'ابحث عن أحدث API ثم أصلح كود المشروع بناء على المصادر'}]});
  assert.equal(mixed.strategy,'team');
  assert.ok(mixed.agents.includes('coder'));
  assert.ok(mixed.agents.includes('researcher'));
  assert.ok(mixed.graph.parallelReadNodes.length>=1);
  assert.ok(mixed.graph.mutationNodes.length>=1);
  assert.equal(mixed.graph.mutationPolicy,'workspace-exclusive');

  const cloud=await core.plan({mode:'code',workspace:'C:/x',messages:[{role:'user',content:'اصلح المشروع ثم deploy على Vercel'}]});
  assert.equal(cloud.strategy,'team');
  assert.ok(cloud.agents.includes('reviewer'));
  assert.ok(cloud.agents.includes('verifier'));
  assert.ok(cloud.gates.some(g=>g.id==='human-approval'));

  const evalBad=core.evaluate(code,{verification:{score:55,toolCalls:0,failed:0,fileOperations:0},content:'تم الإصلاح'});
  assert.equal(evalBad.status,'PARTIAL');
  assert.ok(evalBad.gateFailures>=1);

  const evalGood=core.evaluate(code,{verification:{score:98,toolCalls:5,failed:0,fileOperations:2},content:'اكتمل مع التحقق'});
  assert.notEqual(evalGood.status,'PARTIAL');

  const st=core.status();
  assert.equal(st.registry.invariants.agentApprovalCapability,false);
  assert.equal(st.registry.invariants.protectedModelDeletion,false);
  assert.ok(st.stats.plans>=5);

  const reloaded=new IntelligenceCore({storagePath:path.join(dir,'intel.json'),getSettings:()=>settings,getResourceStatus:async()=>({}),getRegistry:()=>({agents:[],toolGroups:{},skills:[]})});
  await reloaded.init();
  assert.ok(reloaded.status().stats.plans>=5);
  assert.ok(reloaded.status().recentPlans.length>=5);
  console.log('Intelligence Core tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
