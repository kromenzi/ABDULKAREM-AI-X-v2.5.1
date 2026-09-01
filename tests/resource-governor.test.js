const assert = require('assert');
const { ResourceGovernor, ResourcePressureError } = require('../electron/resource-governor');
const GB = 1024 ** 3;

async function main(){
  const models=[
    {name:'qwen3-coder:30b',size:18*GB},
    {name:'qwen2.5-coder:14b',size:9*GB},
    {name:'abdulkarem-general-sa:v2',size:5.2*GB}
  ];
  let sample={
    ram:{totalBytes:64*GB,freeBytes:38*GB,usedBytes:26*GB,pressure:26/64},
    cpu:{load1m:1,cores:16,normalizedLoad:.0625},process:{rssBytes:400*1024**2},
    installedModels:models,runningModels:[],sampledAt:new Date().toISOString()
  };
  const settings={performanceProfile:'balanced',resourceGovernorEnabled:true,resourceAutoContext:true,resourceAutoFallback:true,resourceMaxConcurrentModels:3,resourceRamReserveGb:4,resourcePressureThreshold:.82};
  const g=new ResourceGovernor({getSettings:()=>settings,getInstalledModels:async()=>models,sampleProvider:async()=>sample,protectedModels:['qwen3-coder:30b']});

  const normal=await g.preflight({model:'qwen3-coder:30b',kind:'coding',messages:[{role:'user',content:'fix project'}]});
  assert.equal(normal.blocked,false);
  assert.equal(normal.contextWindow,8192,'30B balanced context should cap to 8192');
  assert.equal(normal.heavy,true);

  sample={...sample,ram:{totalBytes:64*GB,freeBytes:4.5*GB,usedBytes:59.5*GB,pressure:59.5/64},sampledAt:new Date().toISOString()};
  g.lastSample=null;
  const pressure=await g.preflight({model:'qwen3-coder:30b',kind:'coding',messages:[]});
  assert.equal(pressure.blocked,true,'critical pressure should block cold 30B load');
  assert.equal(pressure.contextWindow,4096,'pressure should reduce context');

  sample={...sample,ram:{totalBytes:64*GB,freeBytes:40*GB,usedBytes:24*GB,pressure:24/64},sampledAt:new Date().toISOString()};
  g.lastSample=null;
  let activeHeavy=0,maxHeavy=0;
  const runHeavy=(label)=>g.run({model:'qwen3-coder:30b',kind:'coding',messages:[],task:async()=>{
    activeHeavy++; maxHeavy=Math.max(maxHeavy,activeHeavy);
    await new Promise(r=>setTimeout(r,80)); activeHeavy--; return label;
  }});
  const out=await Promise.all([runHeavy('a'),runHeavy('b')]);
  assert.deepEqual(out,['a','b']);
  assert.equal(maxHeavy,1,'heavy models must serialize even when maxConcurrent > 1');

  const order=[];
  const normal1=g.run({model:'abdulkarem-general-sa:v2',kind:'general',messages:[],task:async()=>{order.push('normal1-start');await new Promise(r=>setTimeout(r,60));order.push('normal1-end');}});
  await new Promise(r=>setTimeout(r,5));
  const heavy=g.run({model:'qwen3-coder:30b',kind:'coding',messages:[],task:async()=>{order.push('heavy-start');await new Promise(r=>setTimeout(r,30));order.push('heavy-end');}});
  const normal2=g.run({model:'abdulkarem-general-sa:v2',kind:'general',messages:[],task:async()=>{order.push('normal2-start');order.push('normal2-end');}});
  await Promise.all([normal1,heavy,normal2]);
  assert.ok(order.indexOf('heavy-start')>order.indexOf('normal1-end'),'heavy must wait for existing normal call');
  assert.ok(order.indexOf('normal2-start')>order.indexOf('heavy-end'),'queued heavy must get exclusive priority before later normal call');

  g.recordFailure('qwen2.5-coder:14b',new Error('failed to allocate pinned memory'));
  g.lastSample=null;
  const cooled=await g.preflight({model:'qwen2.5-coder:14b',kind:'coding',messages:[]});
  assert.ok(cooled.contextWindow<=4096,'recent OOM should force conservative context');
  const status=await g.status();
  assert.ok(status.oomCooldowns.some(x=>x.model==='qwen2.5-coder:14b'));
  assert.ok(status.protectedModels.includes('qwen3-coder:30b'));

  console.log(JSON.stringify({ok:true,normalCtx:normal.contextWindow,pressureBlocked:pressure.blocked,maxHeavy,oomCooldowns:status.oomCooldowns.length},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
