const fs = require('fs');
const path = require('path');

function nowIso(){ return new Date().toISOString(); }
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

class LockTimeoutError extends Error {
  constructor(message='Mutation lock timeout.') { super(message); this.name='LockTimeoutError'; this.code='DAG_LOCK_TIMEOUT'; }
}
class NodeTimeoutError extends Error {
  constructor(message='DAG node timeout.') { super(message); this.name='NodeTimeoutError'; this.code='DAG_NODE_TIMEOUT'; }
}
class DagCancelledError extends Error {
  constructor(message='DAG run cancelled.') { super(message); this.name='DagCancelledError'; this.code='DAG_CANCELLED'; }
}

class MutationLockManager {
  constructor({onWait=()=>{}}={}){
    this.owners=new Map();
    this.queues=new Map();
    this.onWait=onWait;
  }
  async acquire(key, owner, timeoutMs=120000){
    if(!key) return ()=>{};
    const current=this.owners.get(key);
    if(!current){
      this.owners.set(key,owner);
      return ()=>this.release(key,owner);
    }
    if(current===owner) return ()=>{};
    this.onWait(key,owner,current);
    let timer=null;
    return await new Promise((resolve,reject)=>{
      const entry={owner,resolve:()=>{ if(timer)clearTimeout(timer); this.owners.set(key,owner); resolve(()=>this.release(key,owner)); },reject};
      const q=this.queues.get(key)||[]; q.push(entry); this.queues.set(key,q);
      timer=setTimeout(()=>{
        const list=this.queues.get(key)||[];
        const idx=list.indexOf(entry); if(idx>=0)list.splice(idx,1);
        if(list.length)this.queues.set(key,list); else this.queues.delete(key);
        reject(new LockTimeoutError(`Mutation lock '${key}' timed out after ${timeoutMs}ms.`));
      },Math.max(1000,Number(timeoutMs)||120000));
    });
  }
  release(key,owner){
    if(!key || this.owners.get(key)!==owner)return;
    const q=this.queues.get(key)||[];
    const next=q.shift();
    if(q.length)this.queues.set(key,q); else this.queues.delete(key);
    if(next) next.resolve(); else this.owners.delete(key);
  }
  status(){
    return {owners:[...this.owners.entries()].map(([key,owner])=>({key,owner})),waiting:[...this.queues.entries()].map(([key,q])=>({key,count:q.length,owners:q.map(x=>x.owner)}))};
  }
}

class DagExecutor {
  constructor({storagePath='',maxParallel=3,lockTimeoutMs=120000,nodeTimeoutMs=900000,onEvent=()=>{}}={}){
    this.storagePath=storagePath;
    this.maxParallel=Math.max(1,Math.min(8,Number(maxParallel)||3));
    this.lockTimeoutMs=Math.max(1000,Number(lockTimeoutMs)||120000);
    this.nodeTimeoutMs=Math.max(5000,Number(nodeTimeoutMs)||900000);
    this.onEvent=onEvent;
    this.running=new Map();
    this.recentRuns=[];
    this.stats={runs:0,nodes:0,failedRuns:0,cancelledRuns:0,lockWaits:0,parallelBatches:0,maxObservedParallel:0,lastRunAt:null};
    this.locks=new MutationLockManager({onWait:(key,owner,current)=>{
      this.stats.lockWaits+=1;
      this.onEvent('Mutation Lock',`${owner} ينتظر ${key} · owner ${current}`,'running','dag');
    }});
  }
  async init(){
    try{
      const state=JSON.parse(await fs.promises.readFile(this.storagePath,'utf8'));
      this.recentRuns=Array.isArray(state.recentRuns)?state.recentRuns.slice(-50):[];
      this.stats={...this.stats,...(state.stats||{})};
    }catch{}
    return this.status();
  }
  async persist(){
    if(!this.storagePath)return;
    await fs.promises.mkdir(path.dirname(this.storagePath),{recursive:true});
    const tmp=`${this.storagePath}.tmp`;
    await fs.promises.writeFile(tmp,JSON.stringify({recentRuns:this.recentRuns.slice(-50),stats:this.stats},null,2),'utf8');
    try{await fs.promises.rename(tmp,this.storagePath);}catch{await fs.promises.copyFile(tmp,this.storagePath);await fs.promises.unlink(tmp).catch(()=>{});}
  }
  validateGraph(graph={}){
    const nodes=Array.isArray(graph.nodes)?graph.nodes:[];
    if(!nodes.length)throw new Error('DAG graph has no nodes.');
    const ids=new Set();
    for(const node of nodes){
      if(!node?.id)throw new Error('DAG node missing id.');
      if(ids.has(node.id))throw new Error(`Duplicate DAG node id: ${node.id}`);
      ids.add(node.id);
    }
    for(const node of nodes){ for(const dep of node.dependsOn||[]){ if(!ids.has(dep))throw new Error(`DAG node '${node.id}' depends on missing node '${dep}'.`); } }
    const indegree=new Map(nodes.map(n=>[n.id,0]));
    const out=new Map(nodes.map(n=>[n.id,[]]));
    for(const node of nodes){ for(const dep of node.dependsOn||[]){ indegree.set(node.id,indegree.get(node.id)+1); out.get(dep).push(node.id); } }
    const q=[...indegree.entries()].filter(([,v])=>v===0).map(([k])=>k); let seen=0;
    while(q.length){const id=q.shift();seen++;for(const to of out.get(id)||[]){indegree.set(to,indegree.get(to)-1);if(indegree.get(to)===0)q.push(to);}}
    if(seen!==nodes.length)throw new Error('DAG contains a dependency cycle.');
    return true;
  }
  cancel(runId,reason='Cancelled by user.'){
    const run=this.running.get(runId); if(!run)return false;
    run.cancelled=true; run.cancelReason=reason; run.cancelledAt=nowIso();
    this.onEvent('DAG Executor',`${runId} · cancellation requested`,'error','dag');
    return true;
  }
  async run({graph,nodeRunner,classifyNode=()=>({}),maxParallel,metadata={}}={}){
    this.validateGraph(graph);
    if(typeof nodeRunner!=='function')throw new Error('DAG nodeRunner is required.');
    const limit=Math.max(1,Math.min(8,Number(maxParallel)||this.maxParallel));
    const runId=`dag_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const startedAt=Date.now();
    const token={id:runId,cancelled:false,cancelReason:'',startedAt,metadata};
    this.running.set(runId,token);
    this.stats.runs+=1; this.stats.lastRunAt=nowIso();
    const nodes=graph.nodes.map(n=>({...n,dependsOn:[...(n.dependsOn||[])]}));
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const states=new Map(nodes.map(n=>[n.id,{status:'PENDING',startedAt:null,finishedAt:null,error:'',waitMs:0}]));
    const results=new Map();
    const active=new Map();
    let parallelObserved=0;
    this.onEvent('DAG Executor',`${runId} · ${nodes.length} nodes · parallel ${limit}`,'running','dag');

    const executeNode=async(node)=>{
      if(token.cancelled)throw new DagCancelledError(token.cancelReason||'Cancelled.');
      const state=states.get(node.id); state.status='RUNNING';state.startedAt=nowIso();
      const access=classifyNode(node)||{};
      const owner=`${runId}:${node.id}`;
      let release=()=>{}; const waitStart=Date.now();
      if(access.mutationKey){ release=await this.locks.acquire(String(access.mutationKey),owner,Number(access.lockTimeoutMs)||this.lockTimeoutMs); }
      state.waitMs=Date.now()-waitStart;
      if(token.cancelled){release();throw new DagCancelledError(token.cancelReason||'Cancelled.');}
      this.onEvent(`DAG: ${node.label||node.id}`,`${access.mutationKey?'WRITE LOCK':'PARALLEL SAFE'} · start`,'running','dag');
      try{
        let timer;
        const timeoutMs=Math.max(5000,Number(access.nodeTimeoutMs)||this.nodeTimeoutMs);
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new NodeTimeoutError(`Node '${node.id}' exceeded ${timeoutMs}ms.`)),timeoutMs);});
        const value=await Promise.race([Promise.resolve(nodeRunner({node,results,states,runId,token,graph,metadata})),timeout]);
        clearTimeout(timer);
        if(token.cancelled)throw new DagCancelledError(token.cancelReason||'Cancelled.');
        if(value?.success===false)throw new Error(value.error||`Node '${node.id}' failed.`);
        results.set(node.id,value);
        state.status='COMPLETED';state.finishedAt=nowIso();
        this.stats.nodes+=1;
        this.onEvent(`DAG: ${node.label||node.id}`,'completed','done','dag');
        return value;
      }catch(e){
        state.status=e?.code==='DAG_CANCELLED'?'CANCELLED':'FAILED';state.finishedAt=nowIso();state.error=e?.message||String(e);
        this.onEvent(`DAG: ${node.label||node.id}`,state.error,'error','dag');
        throw e;
      }finally{ release(); }
    };

    let fatal=null;
    try{
      while(true){
        if(token.cancelled && active.size===0)break;
        // Mark nodes blocked by failed/cancelled dependencies.
        for(const node of nodes){
          const st=states.get(node.id); if(st.status!=='PENDING')continue;
          const depStates=(node.dependsOn||[]).map(id=>states.get(id)?.status);
          if(depStates.some(s=>['FAILED','CANCELLED','SKIPPED'].includes(s))){st.status='SKIPPED';st.finishedAt=nowIso();st.error='Dependency did not complete successfully.';}
        }
        const ready=nodes.filter(node=>states.get(node.id).status==='PENDING' && (node.dependsOn||[]).every(id=>states.get(id)?.status==='COMPLETED'));
        while(!token.cancelled && active.size<limit && ready.length){
          const node=ready.shift();
          const p=executeNode(node).catch(e=>{ if(!fatal && e?.code!=='DAG_CANCELLED')fatal=e; }).finally(()=>active.delete(node.id));
          active.set(node.id,p);
          parallelObserved=Math.max(parallelObserved,active.size);
          this.stats.maxObservedParallel=Math.max(this.stats.maxObservedParallel,active.size);
          if(active.size>1)this.stats.parallelBatches+=1;
        }
        const terminal=[...states.values()].every(s=>['COMPLETED','FAILED','CANCELLED','SKIPPED'].includes(s.status));
        if(terminal && active.size===0)break;
        if(active.size){ await Promise.race([...active.values()]); continue; }
        if(token.cancelled)break;
        // No runnable or active node while pending nodes remain = scheduler deadlock guard.
        const pending=[...states.entries()].filter(([,s])=>s.status==='PENDING');
        if(pending.length){ fatal=new Error(`DAG scheduler deadlock: ${pending.map(([id])=>id).join(', ')}`); for(const [,s] of pending){s.status='FAILED';s.error=fatal.message;s.finishedAt=nowIso();} break; }
        break;
      }
    }finally{
      if(token.cancelled){ for(const [,s] of states){if(s.status==='PENDING'){s.status='CANCELLED';s.error=token.cancelReason||'Cancelled.';s.finishedAt=nowIso();}} }
      const failed=[...states.values()].filter(s=>s.status==='FAILED').length;
      const cancelled=token.cancelled||[...states.values()].some(s=>s.status==='CANCELLED');
      const status=cancelled?'CANCELLED':failed?'FAILED':'COMPLETED';
      if(status==='FAILED')this.stats.failedRuns+=1;if(status==='CANCELLED')this.stats.cancelledRuns+=1;
      const summary={runId,status,startedAt:new Date(startedAt).toISOString(),finishedAt:nowIso(),durationMs:Date.now()-startedAt,nodeCount:nodes.length,failed,cancelled,parallelObserved,metadata,nodes:Object.fromEntries([...states.entries()])};
      this.recentRuns.push(summary);this.recentRuns=this.recentRuns.slice(-50);
      this.running.delete(runId);
      await this.persist().catch(()=>{});
      this.onEvent('DAG Executor',`${runId} · ${status} · ${summary.durationMs}ms · max parallel ${parallelObserved}`,status==='COMPLETED'?'done':'error','dag');
    }
    const last=this.recentRuns.at(-1);
    if(token.cancelled)throw Object.assign(new DagCancelledError(token.cancelReason||'Cancelled.'),{run:last,results});
    if(fatal)throw Object.assign(fatal,{run:last,results});
    const anyFailed=[...states.values()].some(s=>s.status==='FAILED');
    if(anyFailed)throw Object.assign(new Error('One or more DAG nodes failed.'),{run:last,results});
    return {success:true,run:last,results};
  }
  status(){
    return {success:true,version:'2.5.1',activeRuns:[...this.running.values()].map(r=>({id:r.id,startedAt:new Date(r.startedAt).toISOString(),cancelled:r.cancelled,metadata:r.metadata})),locks:this.locks.status(),stats:{...this.stats},recentRuns:this.recentRuns.slice(-12).reverse(),config:{maxParallel:this.maxParallel,lockTimeoutMs:this.lockTimeoutMs,nodeTimeoutMs:this.nodeTimeoutMs}};
  }
}

module.exports={DagExecutor,MutationLockManager,LockTimeoutError,NodeTimeoutError,DagCancelledError};
