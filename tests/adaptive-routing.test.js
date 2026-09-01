const assert=require('assert');
const {selectModelFromInstalled,adaptiveCandidates,fallbackChain,explainSelection}=require('../electron/model-routing');

const installed=['qwen3-coder:30b','qwen3:8b','tiny:3b'];
const arenaState={
  version:'2.6',
  models:{
    coder:{name:'qwen3-coder:30b',health:'READY',metrics:{quality:96,reliability:97,speed:70,toolAccuracy:94,resourceEfficiency:60,taskMatch:{coding:99,general:82,reasoning:90,tools:95}}},
    qwen:{name:'qwen3:8b',health:'READY',metrics:{quality:88,reliability:96,speed:94,toolAccuracy:85,resourceEfficiency:95,taskMatch:{coding:78,general:94,reasoning:91,tools:84}}},
    tiny:{name:'tiny:3b',health:'COOLDOWN',metrics:{quality:100,reliability:10,speed:100,toolAccuracy:100,resourceEfficiency:100,taskMatch:{coding:100,general:100}}}
  }
};

assert.equal(selectModelFromInstalled({kind:'coding',performanceProfile:'balanced',installed,arenaState}),'qwen3-coder:30b');
assert.equal(selectModelFromInstalled({kind:'general',performanceProfile:'balanced',installed,arenaState}),'qwen3:8b');
assert.notEqual(selectModelFromInstalled({kind:'coding',performanceProfile:'balanced',installed,arenaState}),'tiny:3b');
assert.equal(selectModelFromInstalled({kind:'coding',performanceProfile:'balanced',installed,arenaState,preferred:'qwen3:8b'}),'qwen3:8b');
const ranked=adaptiveCandidates({kind:'coding',installed,arenaState});
assert.equal(ranked[0].name,'qwen3-coder:30b');
assert.ok(!ranked.some(x=>x.name==='tiny:3b'));
const chain=fallbackChain({kind:'coding',installed,arenaState,maxFallbacks:2});
assert.equal(chain[0],'qwen3-coder:30b');
assert.ok(chain.length<=3);
assert.equal(new Set(chain).size,chain.length);
const explained=explainSelection({kind:'coding',installed,arenaState});
assert.equal(explained.mode,'adaptive');
assert.equal(explained.selected,'qwen3-coder:30b');
assert.ok(explained.confidence>0.5);
console.log('adaptive-routing.test.js PASS');
