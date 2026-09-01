const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {DagExecutor}=require('../electron/dag-executor');

const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'abdx-dag-'));
  const ex=new DagExecutor({storagePath:path.join(dir,'dag.json'),maxParallel:3,lockTimeoutMs:1000,nodeTimeoutMs:5000});
  await ex.init();
  let activeReads=0,maxReads=0;
  const graph={nodes:[
    {id:'understand',kind:'planner',dependsOn:[]},
    {id:'r1',kind:'agent',agent:'researcher',dependsOn:['understand']},
    {id:'r2',kind:'agent',agent:'vision',dependsOn:['understand']},
    {id:'review',kind:'review',agent:'reviewer',dependsOn:['r1','r2']}
  ]};
  const run=await ex.run({graph,nodeRunner:async({node})=>{
    if(node.id==='r1'||node.id==='r2'){activeReads++;maxReads=Math.max(maxReads,activeReads);await delay(80);activeReads--;}
    return {success:true,id:node.id};
  },classifyNode:()=>({})});
  assert.equal(run.run.status,'COMPLETED');
  assert.ok(maxReads>=2,'read nodes should overlap');

  let writers=0,maxWriters=0;
  const writeGraph={nodes:[{id:'a',kind:'agent',agent:'coder',dependsOn:[]},{id:'b',kind:'agent',agent:'office',dependsOn:[]}]};
  await ex.run({graph:writeGraph,nodeRunner:async()=>{writers++;maxWriters=Math.max(maxWriters,writers);await delay(60);writers--;return {success:true};},classifyNode:()=>({mutationKey:'workspace:C:/same'})});
  assert.equal(maxWriters,1,'workspace mutations must serialize');
  assert.ok(ex.status().stats.lockWaits>=1);

  assert.throws(()=>ex.validateGraph({nodes:[{id:'a',dependsOn:['b']},{id:'b',dependsOn:['a']}]}),/cycle/i);

  // Dependency gate: downstream nodes must not run after a failed dependency.
  let downstreamRan=false;
  const failGraph={nodes:[{id:'bad',dependsOn:[]},{id:'after',dependsOn:['bad']}]};
  const failed=await ex.run({graph:failGraph,nodeRunner:async({node})=>{if(node.id==='bad')return {success:false,error:'expected failure'};downstreamRan=true;return {success:true};}}).catch(e=>e);
  assert.equal(failed.run.status,'FAILED');
  assert.equal(downstreamRan,false);
  assert.equal(failed.run.nodes.after.status,'SKIPPED');

  // Lock timeout protects the executor from waiting forever on a stuck mutation owner.
  const releaseHeld=await ex.locks.acquire('workspace:C:/locked','holder',1000);
  const lockErr=await ex.locks.acquire('workspace:C:/locked','waiter',80).catch(e=>e);
  assert.equal(lockErr.code,'DAG_LOCK_TIMEOUT');
  releaseHeld();

  const slowGraph={nodes:[{id:'slow',dependsOn:[]}]};
  const p=ex.run({graph:slowGraph,nodeRunner:async({token})=>{for(let i=0;i<30;i++){if(token.cancelled)return {success:false,error:'cancelled'};await delay(10);}return {success:true};}}).catch(e=>e);
  await delay(40);
  const active=ex.status().activeRuns[0];
  assert.ok(active?.id);
  assert.equal(ex.cancel(active.id,'test cancel'),true);
  const cancelled=await p;
  assert.equal(cancelled.code,'DAG_CANCELLED');

  const reloaded=new DagExecutor({storagePath:path.join(dir,'dag.json')});
  await reloaded.init();
  assert.ok(reloaded.status().recentRuns.length>=3);
  console.log('DAG Executor tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
