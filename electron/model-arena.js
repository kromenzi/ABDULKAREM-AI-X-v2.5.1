const fs = require('fs');
const path = require('path');
const os = require('os');

const ARENA_VERSION = '2.6';
const DEFAULT_ARENA_STATE_PATH = path.join(os.homedir(), '.abdulkarem-ai-x', 'model-arena-v2.6.json');
const PROTECTED_MODELS = new Set(['qwen3-coder:30b']);
const DEFAULT_WEIGHTS = Object.freeze({quality:0.40,reliability:0.20,taskMatch:0.15,speed:0.10,toolAccuracy:0.10,resourceEfficiency:0.05});
const BENCHMARKS = Object.freeze({
  coding:[
    {id:'coding-fix',prompt:'Return only JSON: {"answer":"fixed"}. A React build fails because a variable is referenced before declaration. State the safe fix in one short sentence inside answer.'},
    {id:'coding-format',prompt:'Return only valid JSON with keys language and code. language must be javascript. code must be: const sum=(a,b)=>a+b;'}
  ],
  general:[
    {id:'general-instruction',prompt:'Return only JSON: {"answer":"ABDULKAREM AI X"}.'},
    {id:'general-summary',prompt:'Return only JSON with key answer. Summarize: Local-first AI keeps private workloads on the user device. Use at most 8 words.'}
  ],
  reasoning:[
    {id:'reasoning-constraint',prompt:'Return only JSON with numeric answer. If 3 workers each complete 4 tasks, and 2 tasks fail verification, how many verified tasks remain?'},
    {id:'reasoning-order',prompt:'Return only JSON with array answer. Sort these numbers ascending: 9, 2, 5, 1.'}
  ],
  tools:[
    {id:'tools-json',prompt:'Return only valid JSON: {"tool":"read_file","args":{"path":"README.md"}}. Do not add markdown.'},
    {id:'tools-no-fake',prompt:'Return only JSON with boolean answer. If a requested tool is unavailable, should an agent invent a fake tool result?'}
  ],
  vision:[
    {id:'vision-capability',prompt:'Return only JSON with boolean answer indicating whether you can analyze an image when image input is actually supplied.'}
  ]
});

function nowIso(){return new Date().toISOString();}
function clamp(n,min=0,max=100){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;}
function avg(xs=[]){const vals=xs.map(Number).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;}
function pct(a,b){return b?clamp((a/b)*100):0;}
function normalizeKind(kind='general'){
  const k=String(kind||'general').toLowerCase();
  if(['code','coder','coding','programming'].includes(k))return 'coding';
  if(['reason','reasoning','plan','planning'].includes(k))return 'reasoning';
  if(['tool','tools','tool-use','tool_use'].includes(k))return 'tools';
  if(['vision','image','images'].includes(k))return 'vision';
  return 'general';
}
function normalizeModelName(name=''){return String(name||'').trim();}
function modelKey(name=''){return normalizeModelName(name).toLowerCase();}
function parseSizeB(name=''){
  const m=String(name).match(/(?:^|[:_-])(\d+(?:\.\d+)?)b(?:$|[-_])/i);
  return m?Number(m[1]):0;
}
function inferCapabilities(name=''){
  const n=String(name).toLowerCase();
  return {
    coding:/(coder|code|devstral|starcoder)/.test(n),
    vision:/(vl|vision|llava|gemma3|gemma4)/.test(n),
    reasoning:/(qwen3|reason|r1|nemotron|deepseek)/.test(n),
    tools:true,
    general:true
  };
}
function resourceEfficiency(name=''){
  const size=parseSizeB(name);
  if(!size)return 70;
  if(size<=8)return 95;
  if(size<=14)return 82;
  if(size<=32)return 65;
  return 45;
}
function safeJson(text=''){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw);}catch{}
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1));}catch{}}
  return null;
}
function scoreResponse(kind,bench,response){
  const text=String(response||'').trim();
  const parsed=safeJson(text);
  let quality=0,toolAccuracy=70;
  if(parsed)quality+=55;
  if(text.length>0)quality+=10;
  if(!/```/.test(text))quality+=10;
  if(kind==='coding'&&parsed&&(parsed.answer==='fixed'||parsed.language==='javascript'))quality+=25;
  else if(kind==='general'&&parsed&&parsed.answer!=null)quality+=25;
  else if(kind==='reasoning'&&parsed&&parsed.answer!=null)quality+=25;
  else if(kind==='tools'){
    if(parsed&&(parsed.tool==='read_file'||typeof parsed.answer==='boolean')){quality+=25;toolAccuracy=100;}else toolAccuracy=30;
  } else if(kind==='vision'&&parsed&&typeof parsed.answer==='boolean')quality+=25;
  return {quality:clamp(quality),toolAccuracy:clamp(toolAccuracy)};
}
function healthFromStats(stats={}){
  const calls=Number(stats.calls||0),failures=Number(stats.failures||0);
  const failureRate=calls?failures/calls:0;
  if(stats.offline)return 'OFFLINE';
  if(Number(stats.consecutiveFailures||0)>=5)return 'COOLDOWN';
  if(calls>=3&&failureRate>=0.5)return 'DEGRADED';
  if(Number(stats.avgLatencyMs||0)>=30000)return 'SLOW';
  return 'READY';
}
function finalScore(metrics={},kind='general',weights=DEFAULT_WEIGHTS){
  const taskMatch=metrics.taskMatch?.[normalizeKind(kind)] ?? metrics.taskMatch ?? 50;
  return clamp(
    clamp(metrics.quality)*weights.quality+
    clamp(metrics.reliability)*weights.reliability+
    clamp(taskMatch)*weights.taskMatch+
    clamp(metrics.speed)*weights.speed+
    clamp(metrics.toolAccuracy)*weights.toolAccuracy+
    clamp(metrics.resourceEfficiency)*weights.resourceEfficiency
  );
}

class ModelArena {
  constructor({statePath=DEFAULT_ARENA_STATE_PATH,getModels=async()=>[],probeModel=async()=>({success:false,error:'probe unavailable'}),protectedModels=[...PROTECTED_MODELS],onEvent=()=>{}}={}){
    this.statePath=statePath;
    this.getModels=getModels;
    this.probeModel=probeModel;
    this.protectedModels=new Set(protectedModels||[]);
    this.onEvent=onEvent;
    this.state={version:ARENA_VERSION,updatedAt:null,models:{},runs:[],decisions:[]};
    this._persistChain=Promise.resolve();
  }
  async init(){
    try{
      const raw=JSON.parse(await fs.promises.readFile(this.statePath,'utf8'));
      this.state={...this.state,...raw,version:ARENA_VERSION,models:raw.models||{},runs:Array.isArray(raw.runs)?raw.runs.slice(-30):[],decisions:Array.isArray(raw.decisions)?raw.decisions.slice(-200):[]};
    }catch{}
    return this.status();
  }
  async persist(){
    if(!this.statePath)return;
    this._persistChain=this._persistChain.then(async()=>{
      await fs.promises.mkdir(path.dirname(this.statePath),{recursive:true});
      const tmp=`${this.statePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmp,JSON.stringify(this.state,null,2),'utf8');
      try{await fs.promises.rename(tmp,this.statePath);}catch{
        await fs.promises.copyFile(tmp,this.statePath);await fs.promises.unlink(tmp).catch(()=>{});
      }
    });
    return this._persistChain;
  }
  status(){
    const models=Object.values(this.state.models||{});
    return {version:ARENA_VERSION,statePath:this.statePath,updatedAt:this.state.updatedAt,models:models.length,ready:models.filter(m=>m.health==='READY').length,protected:[...this.protectedModels],lastRun:this.state.runs.at(-1)||null};
  }
  rankings(kind='general'){
    const k=normalizeKind(kind);
    return Object.values(this.state.models||{}).map(m=>({name:m.name,health:m.health||'READY',score:finalScore(m.metrics||{},k),metrics:m.metrics||{},protected:this.protectedModels.has(m.name)})).sort((a,b)=>b.score-a.score);
  }
  snapshot(){
    const rankings={};
    for(const kind of ['coding','general','reasoning','tools','vision'])rankings[kind]=this.rankings(kind);
    return {version:ARENA_VERSION,updatedAt:this.state.updatedAt,statePath:this.statePath,rankings,models:this.state.models};
  }
  async run({modelNames=[],kinds=['coding','general','reasoning','tools'],maxModels=6}={}){
    const discovered=(await this.getModels()||[]).map(m=>typeof m==='string'?m:m?.name).filter(Boolean);
    const requested=(modelNames||[]).filter(Boolean);
    const selected=(requested.length?requested:discovered).slice(0,Math.max(1,Number(maxModels)||6));
    const run={id:`arena_${Date.now()}`,version:ARENA_VERSION,startedAt:nowIso(),models:[],kinds:(kinds||[]).map(normalizeKind)};
    this.onEvent('Model Arena',`Benchmarking ${selected.length} model(s)`,'running','arena');
    for(const name of selected){
      const caps=inferCapabilities(name);
      const previous=this.state.models[modelKey(name)]||{};
      const samples=[];
      let failures=0,consecutiveFailures=0;
      for(const kind of run.kinds){
        if(kind==='vision'&&!caps.vision)continue;
        for(const bench of BENCHMARKS[kind]||[]){
          const started=Date.now();
          try{
            const r=await this.probeModel(name,{kind,benchmark:bench});
            const latencyMs=Math.max(1,Number(r?.latencyMs||Date.now()-started));
            if(r?.success===true){
              const scored=scoreResponse(kind,bench,r.reply||r.response||'');
              samples.push({kind,id:bench.id,success:true,latencyMs,...scored});consecutiveFailures=0;
            }else{
              failures+=1;consecutiveFailures+=1;samples.push({kind,id:bench.id,success:false,latencyMs,quality:0,toolAccuracy:0,error:r?.error||'probe failed'});
            }
          }catch(e){failures+=1;consecutiveFailures+=1;samples.push({kind,id:bench.id,success:false,latencyMs:Date.now()-started,quality:0,toolAccuracy:0,error:e.message||String(e)});}
        }
      }
      const calls=samples.length;
      const ok=samples.filter(x=>x.success);
      const latency=avg(ok.map(x=>x.latencyMs));
      const reliability=pct(ok.length,calls);
      const speed=latency?clamp(100-(latency/300)):50;
      const taskMatch={};
      for(const kind of ['coding','general','reasoning','tools','vision']){
        const group=samples.filter(x=>x.kind===kind);
        taskMatch[kind]=group.length?avg(group.map(x=>x.quality)):caps[kind]?55:10;
      }
      const metrics={
        quality:avg(ok.map(x=>x.quality)),reliability,speed,
        toolAccuracy:avg(ok.filter(x=>x.kind==='tools').map(x=>x.toolAccuracy))||70,
        resourceEfficiency:resourceEfficiency(name),taskMatch,
        calls:(Number(previous.metrics?.calls)||0)+calls,
        successes:(Number(previous.metrics?.successes)||0)+ok.length,
        failures:(Number(previous.metrics?.failures)||0)+failures,
        avgLatencyMs:Math.round(latency||0),consecutiveFailures
      };
      const entry={name,capabilities:caps,protected:this.protectedModels.has(name),health:healthFromStats(metrics),metrics,lastBenchmarkedAt:nowIso(),samples:samples.slice(-20)};
      this.state.models[modelKey(name)]=entry;
      run.models.push({name,health:entry.health,score:finalScore(metrics,'general'),samples:calls});
    }
    run.finishedAt=nowIso();
    this.state.updatedAt=run.finishedAt;
    this.state.runs.push(run);this.state.runs=this.state.runs.slice(-30);
    await this.persist();
    this.onEvent('Model Arena',`Completed ${selected.length} model(s)`,'done','arena');
    return {...run,rankings:this.snapshot().rankings};
  }
  async recordRuntimeResult({model,kind='general',success,latencyMs=0,quality=null,toolAccuracy=null}={}){
    const key=modelKey(model);if(!key)return null;
    const old=this.state.models[key]||{name:model,capabilities:inferCapabilities(model),metrics:{taskMatch:{}}};
    const m={...(old.metrics||{}),taskMatch:{...(old.metrics?.taskMatch||{})}};
    const calls=Number(m.runtimeCalls||0)+1,successes=Number(m.runtimeSuccesses||0)+(success?1:0),failures=Number(m.runtimeFailures||0)+(success?0:1);
    m.runtimeCalls=calls;m.runtimeSuccesses=successes;m.runtimeFailures=failures;m.runtimeReliability=pct(successes,calls);
    m.runtimeAvgLatencyMs=Math.round(((Number(m.runtimeAvgLatencyMs||0)*(calls-1))+Math.max(0,Number(latencyMs)||0))/calls);
    if(Number.isFinite(Number(quality)))m.taskMatch[normalizeKind(kind)]=clamp((Number(m.taskMatch[normalizeKind(kind)]||50)*0.8)+(Number(quality)*0.2));
    if(Number.isFinite(Number(toolAccuracy)))m.toolAccuracy=clamp((Number(m.toolAccuracy||70)*0.8)+(Number(toolAccuracy)*0.2));
    m.reliability=clamp((Number(m.reliability||70)*0.7)+(m.runtimeReliability*0.3));
    m.consecutiveFailures=success?0:Number(m.consecutiveFailures||0)+1;
    const entry={...old,name:model,metrics:m,health:healthFromStats(m),lastRuntimeAt:nowIso()};
    this.state.models[key]=entry;this.state.updatedAt=nowIso();await this.persist();return entry;
  }
}

module.exports={ARENA_VERSION,DEFAULT_ARENA_STATE_PATH,PROTECTED_MODELS,DEFAULT_WEIGHTS,BENCHMARKS,ModelArena,normalizeKind,inferCapabilities,resourceEfficiency,finalScore,healthFromStats,safeJson};
