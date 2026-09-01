const assert=require('assert');
const os=require('os');
const path=require('path');
const fs=require('fs');
const {ModelArena,finalScore,healthFromStats,inferCapabilities}=require('../electron/model-arena');

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aix-arena-'));
  const statePath=path.join(dir,'arena.json');
  const replies={
    'qwen3-coder:30b':'{"answer":"fixed","language":"javascript","code":"const sum=(a,b)=>a+b;","tool":"read_file","args":{"path":"README.md"}}',
    'tiny:3b':'not json'
  };
  const arena=new ModelArena({
    statePath,
    getModels:async()=>['qwen3-coder:30b','tiny:3b'],
    probeModel:async(model)=>({success:true,reply:replies[model],latencyMs:model==='qwen3-coder:30b'?80:900}),
    protectedModels:['qwen3-coder:30b']
  });
  await arena.init();
  const run=await arena.run({kinds:['coding','general','reasoning','tools'],maxModels:2});
  assert.equal(run.models.length,2);
  const coding=arena.rankings('coding');
  assert.equal(coding[0].name,'qwen3-coder:30b');
  assert.equal(coding[0].protected,true);
  assert.ok(coding[0].score>coding[1].score);
  assert.equal(arena.status().models,2);
  assert.ok(fs.existsSync(statePath));
  assert.equal(healthFromStats({calls:5,failures:5,consecutiveFailures:5}),'COOLDOWN');
  assert.equal(inferCapabilities('qwen3-vl:8b').vision,true);
  assert.ok(finalScore({quality:100,reliability:100,taskMatch:{coding:100},speed:100,toolAccuracy:100,resourceEfficiency:100},'coding')>=99);
  await arena.recordRuntimeResult({model:'tiny:3b',kind:'coding',success:false,latencyMs:1000,quality:10});
  assert.ok(arena.state.models['tiny:3b'].metrics.runtimeFailures>=1);
  fs.rmSync(dir,{recursive:true,force:true});
  console.log('model-arena.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
