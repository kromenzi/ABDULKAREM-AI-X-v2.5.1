#!/usr/bin/env node
const {ModelArena,DEFAULT_ARENA_STATE_PATH}=require('../electron/model-arena');

const OLLAMA_BASE=process.env.OLLAMA_BASE_URL||'http://127.0.0.1:11434';
const args=process.argv.slice(2);
const live=!args.includes('--dry-run');
const maxArg=args.find(x=>x.startsWith('--max='));
const maxModels=maxArg?Math.max(1,Number(maxArg.split('=')[1])||6):6;
const kindsArg=args.find(x=>x.startsWith('--kinds='));
const kinds=kindsArg?kindsArg.split('=')[1].split(',').map(x=>x.trim()).filter(Boolean):['coding','general','reasoning','tools'];
const modelArgs=args.filter(x=>x.startsWith('--model=')).map(x=>x.slice('--model='.length)).filter(Boolean);

async function getModels(){
  const r=await fetch(`${OLLAMA_BASE}/api/tags`,{signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error(`Ollama tags HTTP ${r.status}`);
  const j=await r.json();
  return (j.models||[]).map(x=>x.name).filter(Boolean);
}
async function probeModel(model,{benchmark}={}){
  if(!live)return {success:true,reply:'{"answer":"dry-run"}',latencyMs:1};
  const started=Date.now();
  try{
    const r=await fetch(`${OLLAMA_BASE}/api/generate`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model,prompt:benchmark?.prompt||'Return only JSON: {"answer":"ok"}.',stream:false,format:'json',options:{temperature:0,num_predict:160}}),
      signal:AbortSignal.timeout(90000)
    });
    if(!r.ok)return {success:false,error:`HTTP ${r.status}`,latencyMs:Date.now()-started};
    const j=await r.json();
    return {success:true,reply:j.response||'',latencyMs:Date.now()-started};
  }catch(e){return {success:false,error:e.message||String(e),latencyMs:Date.now()-started};}
}

(async()=>{
  const arena=new ModelArena({statePath:process.env.ABDX_MODEL_ARENA_STATE||DEFAULT_ARENA_STATE_PATH,getModels,probeModel,onEvent:(label,detail,status)=>console.log(`[${status}] ${label}: ${detail}`)});
  await arena.init();
  const models=await getModels();
  if(!models.length)throw new Error('No Ollama models were discovered. Start Ollama and install at least one model.');
  const selected=modelArgs.length?modelArgs:models;
  const result=await arena.run({modelNames:selected,kinds,maxModels});
  console.log(`\nABDULKAREM AI X Model Arena v2.6`);
  console.log(`State: ${arena.statePath}`);
  for(const kind of kinds){
    const rows=result.rankings[kind]||[];
    console.log(`\n${kind.toUpperCase()}`);
    rows.slice(0,10).forEach((x,i)=>console.log(`${String(i+1).padStart(2,' ')}. ${x.name}  score=${x.score.toFixed(1)}  health=${x.health}${x.protected?'  PROTECTED':''}`));
  }
})().catch(e=>{console.error(`Model Arena failed: ${e.message||e}`);process.exitCode=1;});
