const fs=require('fs');
const path=require('path');
const {DEFAULT_ARENA_STATE_PATH,normalizeKind,finalScore}=require('./model-arena');

const MODEL_PRIORITIES={
  eco:{
    vision:['qwen3-vl:8b','qwen3-vl','gemma3','gemma4:26b'],
    coding:['qwen2.5-coder:14b','alenzi-coder-pro-14b:latest','my-coder-pro:latest','qwen3-coder:30b','qwen3:8b'],
    general:['abdulkarem-general-sa:v2','qwen3:8b','qwen3:14b','qwen3-coder:30b'],
    reasoning:['qwen3:8b','qwen3:14b','qwen3-coder:30b','nemotron-3.5-lightning'],
    tools:['qwen3:8b','qwen3:14b','qwen3-coder:30b']
  },
  max:{
    vision:['gemma4:26b','qwen3-vl:32b','qwen3-vl:30b','qwen3-vl:8b','qwen3-vl','gemma3'],
    coding:['qwen3-coder:30b','qwen3-coder-next','qwen3-coder','qwen2.5-coder:14b','alenzi-coder-pro-14b:latest'],
    general:['abdulkarem-general-sa:v2','qwen3:32b','nemotron-3.5-lightning','qwen3:14b','qwen3:8b','qwen3-coder:30b'],
    reasoning:['qwen3:32b','nemotron-3.5-lightning','qwen3:14b','qwen3-coder:30b','qwen3:8b'],
    tools:['qwen3-coder:30b','qwen3:32b','qwen3:14b','qwen3:8b']
  },
  balanced:{
    vision:['gemma4:26b','qwen3-vl:8b','qwen3-vl','gemma3'],
    coding:['qwen3-coder:30b','qwen2.5-coder:14b','alenzi-coder-pro-14b:latest','qwen3-coder-next','qwen3-coder'],
    general:['abdulkarem-general-sa:v2','qwen3:8b','qwen3:14b','nemotron-3.5-lightning','qwen3-coder:30b'],
    reasoning:['qwen3:14b','qwen3:8b','nemotron-3.5-lightning','qwen3-coder:30b'],
    tools:['qwen3-coder:30b','qwen3:14b','qwen3:8b']
  }
};

const DEFAULT_AUDIT_PATH=path.join(path.dirname(DEFAULT_ARENA_STATE_PATH),'routing-decisions-v2.6.jsonl');
let arenaCache={path:'',mtimeMs:-1,data:null};
function findInstalled(installed,wanted){
  const list=(installed||[]).map(String);
  return list.find(x=>x.toLowerCase()===String(wanted).toLowerCase()) || list.find(x=>x.toLowerCase().includes(String(wanted).toLowerCase())) || '';
}
function readArenaState(statePath=process.env.ABDX_MODEL_ARENA_STATE||DEFAULT_ARENA_STATE_PATH){
  if(process.env.ABDX_ADAPTIVE_ROUTING==='0')return null;
  try{
    const stat=fs.statSync(statePath);
    if(arenaCache.path===statePath&&arenaCache.mtimeMs===stat.mtimeMs)return arenaCache.data;
    const data=JSON.parse(fs.readFileSync(statePath,'utf8'));
    arenaCache={path:statePath,mtimeMs:stat.mtimeMs,data};
    return data;
  }catch{return null;}
}
function healthAllowed(health='READY'){
  return !['OFFLINE','COOLDOWN'].includes(String(health||'READY').toUpperCase());
}
function adaptiveCandidates({kind='general',installed=[],arenaState=null,performanceProfile='balanced'}={}){
  const k=normalizeKind(kind);
  const list=(installed||[]).map(String).filter(Boolean);
  const state=arenaState||readArenaState();
  if(!state?.models)return [];
  const staticProfile=MODEL_PRIORITIES[performanceProfile]||MODEL_PRIORITIES.balanced;
  const staticList=staticProfile[k]||staticProfile.general;
  return list.map(name=>{
    const entry=Object.values(state.models).find(m=>String(m?.name||'').toLowerCase()===name.toLowerCase());
    if(!entry||!healthAllowed(entry.health))return null;
    let score=finalScore(entry.metrics||{},k);
    const staticIndex=staticList.findIndex(x=>findInstalled([name],x));
    if(staticIndex>=0)score+=Math.max(0,4-staticIndex*0.6);
    if(performanceProfile==='eco')score+=(Number(entry.metrics?.resourceEfficiency||0)-50)*0.08;
    if(performanceProfile==='max')score+=(Number(entry.metrics?.quality||0)-50)*0.04;
    return {name,score,health:entry.health||'READY',metrics:entry.metrics||{}};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
}
function fallbackChain({kind='general',performanceProfile='balanced',installed=[],preferred='auto',arenaState=null,maxFallbacks=2}={}){
  const list=(installed||[]).map(String).filter(Boolean);
  const chain=[];
  const add=name=>{if(name&&!chain.some(x=>x.toLowerCase()===name.toLowerCase()))chain.push(name);};
  if(preferred&&preferred!=='auto')add(list.find(x=>x.toLowerCase()===String(preferred).toLowerCase()));
  for(const c of adaptiveCandidates({kind,installed:list,arenaState,performanceProfile}))add(c.name);
  const profile=MODEL_PRIORITIES[performanceProfile]||MODEL_PRIORITIES.balanced;
  for(const wanted of profile[normalizeKind(kind)]||profile.general)add(findInstalled(list,wanted));
  for(const name of list)add(name);
  return chain.slice(0,Math.max(1,Number(maxFallbacks||2)+1));
}
function auditDecision(record={},auditPath=process.env.ABDX_ROUTING_AUDIT_PATH||DEFAULT_AUDIT_PATH){
  if(process.env.ABDX_ROUTING_AUDIT==='0')return;
  try{
    fs.mkdirSync(path.dirname(auditPath),{recursive:true});
    fs.appendFileSync(auditPath,`${JSON.stringify({...record,at:new Date().toISOString()})}\n`,'utf8');
  }catch{}
}
function selectModelFromInstalled({kind='general',performanceProfile='balanced',installed=[],preferred='auto',arenaState=null}={}){
  const list=(installed||[]).map(String).filter(Boolean);
  if(preferred&&preferred!=='auto'){
    const hit=list.find(x=>x.toLowerCase()===String(preferred).toLowerCase());
    if(hit)return hit;
  }
  const effectiveState=arenaState||readArenaState();
  const adaptive=adaptiveCandidates({kind,installed:list,arenaState:effectiveState,performanceProfile});
  if(adaptive.length){
    const selected=adaptive[0].name;
    if(!arenaState)auditDecision({taskType:normalizeKind(kind),selectedModel:selected,confidence:Math.max(0,Math.min(1,adaptive[0].score/100)),health:adaptive[0].health,mode:'adaptive',alternatives:adaptive.slice(1,3).map(x=>x.name)});
    return selected;
  }
  const profile=MODEL_PRIORITIES[performanceProfile]||MODEL_PRIORITIES.balanced;
  const priorities=profile[normalizeKind(kind)]||profile.general;
  for(const wanted of priorities){const hit=findInstalled(list,wanted);if(hit)return hit;}
  return list[0]||'';
}
function explainSelection(options={}){
  const selected=selectModelFromInstalled(options);
  const candidates=adaptiveCandidates(options);
  const adaptive=candidates.find(x=>x.name===selected);
  return {
    selected,
    mode:adaptive?'adaptive':'static-fallback',
    confidence:adaptive?Math.max(0,Math.min(1,adaptive.score/100)):null,
    health:adaptive?.health||null,
    fallbackChain:fallbackChain(options),
    topCandidates:candidates.slice(0,5)
  };
}
function resetArenaCache(){arenaCache={path:'',mtimeMs:-1,data:null};}

module.exports={MODEL_PRIORITIES,DEFAULT_AUDIT_PATH,selectModelFromInstalled,adaptiveCandidates,fallbackChain,explainSelection,readArenaState,auditDecision,resetArenaCache};
