const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function nowIso(){ return new Date().toISOString(); }
function makeId(){ return `wt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function safeName(s){ return String(s||'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,80); }

function run(cmd,args,{cwd='',input=null,timeoutMs=120000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd:cwd||undefined,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr=''; let done=false;
    const timer=setTimeout(()=>{ if(done)return; try{child.kill();}catch{}; const e=new Error(`${cmd} timed out after ${timeoutMs}ms`); e.code='WT_TIMEOUT'; reject(e); },Math.max(1000,timeoutMs));
    child.stdout.on('data',d=>stdout+=d.toString());
    child.stderr.on('data',d=>stderr+=d.toString());
    child.on('error',e=>{ if(done)return; done=true;clearTimeout(timer);reject(e); });
    child.on('close',code=>{
      if(done)return; done=true;clearTimeout(timer);
      const out={code:Number(code||0),stdout,stderr};
      if(code===0)return resolve(out);
      const e=new Error((stderr||stdout||`${cmd} exited ${code}`).trim()); e.code='WT_COMMAND'; e.result=out; reject(e);
    });
    if(input!==null && input!==undefined)child.stdin.end(input); else child.stdin.end();
  });
}

async function git(cwd,args,opts={}){ return run('git',['-C',cwd,...args],opts); }
async function gitInput(cwd,args,input,opts={}){ return run('git',['-C',cwd,...args],{...opts,input}); }

class WorktreeManager {
  constructor({baseDir,onEvent=()=>{},maxPatchBytes=32*1024*1024,retention=30,requireClean=true}={}){
    this.baseDir=path.resolve(baseDir||path.join(process.cwd(),'.abdulkarem-worktrees'));
    this.sandboxesDir=path.join(this.baseDir,'sandboxes');
    this.recordsDir=path.join(this.baseDir,'records');
    this.onEvent=onEvent;
    this.maxPatchBytes=Math.max(1024*1024,Number(maxPatchBytes)||32*1024*1024);
    this.retention=Math.max(5,Number(retention)||30);
    this.requireClean=requireClean!==false;
    this.active=new Map(); // workspace -> Set(worktree ids), supports parallel isolated lanes
    this.recent=[];
  }

  async init(){
    await fsp.mkdir(this.sandboxesDir,{recursive:true});
    await fsp.mkdir(this.recordsDir,{recursive:true});
    await this.recoverStale();
    return this.status();
  }

  manifestPath(id){ return path.join(this.recordsDir,`${safeName(id)}.json`); }
  patchPath(id){ return path.join(this.recordsDir,`${safeName(id)}.patch`); }
  sandboxPath(id){ return path.join(this.sandboxesDir,safeName(id)); }

  async writeManifest(m){
    m.updatedAt=nowIso();
    const p=this.manifestPath(m.id),tmp=`${p}.tmp`;
    await fsp.mkdir(path.dirname(p),{recursive:true});
    await fsp.writeFile(tmp,JSON.stringify(m,null,2),'utf8');
    try{await fsp.rename(tmp,p);}catch{await fsp.copyFile(tmp,p);await fsp.rm(tmp,{force:true}).catch(()=>{});}
    this.recent.push(this.public(m)); if(this.recent.length>100)this.recent=this.recent.slice(-100);
  }

  async readManifest(id){ return JSON.parse(await fsp.readFile(this.manifestPath(id),'utf8')); }

  async ensureLocalExclude(repoTop){
    try{
      const raw=(await git(repoTop,['rev-parse','--git-path','info/exclude'],{timeoutMs:15000})).stdout.trim();
      const p=path.isAbsolute(raw)?raw:path.resolve(repoTop,raw);
      await fsp.mkdir(path.dirname(p),{recursive:true});
      let text='';try{text=await fsp.readFile(p,'utf8');}catch{}
      if(!text.split(/\r?\n/).some(x=>x.trim()==='.abdulkarem/')){
        await fsp.appendFile(p,`${text&&!text.endsWith('\n')?'\n':''}.abdulkarem/\n`,'utf8');
      }
    }catch{}
  }

  async repoInfo(workspace){
    const root=path.resolve(workspace||'.');
    try{
      const top=(await git(root,['rev-parse','--show-toplevel'],{timeoutMs:15000})).stdout.trim();
      const inside=(await git(root,['rev-parse','--is-inside-work-tree'],{timeoutMs:15000})).stdout.trim()==='true';
      if(!inside||!top)return {eligible:false,reason:'not-git-worktree',workspace:root};
      await this.ensureLocalExclude(top);
      let head='';
      try{head=(await git(top,['rev-parse','HEAD'],{timeoutMs:15000})).stdout.trim();}catch{return {eligible:false,reason:'git-head-missing',workspace:root,repoTop:top};}
      const status=(await git(top,['status','--porcelain=v1','--untracked-files=all'],{timeoutMs:30000})).stdout;
      const rel=path.relative(top,root);
      if(rel.startsWith('..')||path.isAbsolute(rel))return {eligible:false,reason:'workspace-outside-repo',workspace:root,repoTop:top};
      if(this.requireClean && status.trim())return {eligible:false,reason:'workspace-dirty',workspace:root,repoTop:top,head,dirty:true,status:status.slice(0,12000)};
      return {eligible:true,reason:'git-clean',workspace:root,repoTop:path.resolve(top),workspaceRel:rel||'',head,dirty:Boolean(status.trim()),status:status.slice(0,12000)};
    }catch(e){ return {eligible:false,reason:'git-unavailable-or-invalid',workspace:root,error:e.message||String(e)}; }
  }

  async linkRuntimeDependencies(originalWorkspace,sandboxWorkspace,repoTop,sandboxRoot){
    const pairs=[]; const names=['node_modules','.venv','venv'];
    const roots=[[path.resolve(originalWorkspace),path.resolve(sandboxWorkspace)]];
    if(path.resolve(originalWorkspace)!==path.resolve(repoTop))roots.push([path.resolve(repoTop),path.resolve(sandboxRoot)]);
    for(const [srcRoot,dstRoot] of roots){
      for(const name of names){
        const src=path.join(srcRoot,name),dst=path.join(dstRoot,name);
        try{
          const st=await fsp.stat(src); if(!st.isDirectory()||fs.existsSync(dst))continue;
          await fsp.mkdir(path.dirname(dst),{recursive:true});
          await fsp.symlink(src,dst,process.platform==='win32'?'junction':'dir');
          pairs.push({name,source:src,target:dst});
        }catch{}
      }
    }
    return pairs;
  }

  async removeRuntimeLinks(m){
    for(const link of (m.runtimeLinks||[])){
      try{
        const st=await fsp.lstat(link.target);
        if(st.isSymbolicLink())await fsp.unlink(link.target);
      }catch{}
    }
  }

  async prepare(workspace,metadata={}){
    const info=await this.repoInfo(workspace);
    if(!info.eligible)return {success:false,eligible:false,...info};
    const id=makeId(); const sandboxRoot=this.sandboxPath(id);
    await fsp.rm(sandboxRoot,{recursive:true,force:true}).catch(()=>{});
    this.onEvent('Worktree Sandbox',`${id} · creating detached sandbox`,'running','sandbox');
    await git(info.repoTop,['worktree','add','--detach',sandboxRoot,info.head],{timeoutMs:120000});
    const sandboxWorkspace=info.workspaceRel ? path.join(sandboxRoot,info.workspaceRel) : sandboxRoot;
    const runtimeLinks=await this.linkRuntimeDependencies(info.workspace,sandboxWorkspace,info.repoTop,sandboxRoot);
    const m={
      id,status:'ACTIVE',createdAt:nowIso(),updatedAt:nowIso(),metadata,
      originalWorkspace:info.workspace,repoTop:info.repoTop,workspaceRel:info.workspaceRel,baseHead:info.head,
      sandboxRoot,sandboxWorkspace,runtimeLinks,patch:null,verification:null,mergedAt:null,abortedAt:null,abortReason:''
    };
    await this.writeManifest(m);
    const activeKey=path.resolve(info.workspace); const activeSet=this.active.get(activeKey)||new Set(); activeSet.add(id); this.active.set(activeKey,activeSet);
    this.onEvent('Worktree Sandbox',`${id} · isolated workspace ready`,'done','sandbox');
    return this.public(m);
  }

  async originalStillSafe(m){
    const head=(await git(m.repoTop,['rev-parse','HEAD'],{timeoutMs:15000})).stdout.trim();
    const status=(await git(m.repoTop,['status','--porcelain=v1','--untracked-files=all'],{timeoutMs:30000})).stdout;
    const safe=head===m.baseHead && (!this.requireClean || !status.trim());
    return {safe,head,status:status.slice(0,12000),reason:head!==m.baseHead?'original-head-changed':(status.trim()?'original-workspace-dirty':'unchanged')};
  }

  async exportPatch(id,verification=null){
    const m=await this.readManifest(id);
    if(!['ACTIVE','PATCH_READY'].includes(m.status))throw new Error(`Sandbox ${id} is ${m.status}; patch export is not allowed.`);
    await this.removeRuntimeLinks(m);
    const sandboxHead=(await git(m.sandboxRoot,['rev-parse','HEAD'],{timeoutMs:15000})).stdout.trim();
    if(sandboxHead!==m.baseHead)throw new Error('Sandbox HEAD changed. Merge blocked to avoid applying an untrusted history rewrite.');
    await git(m.sandboxRoot,['add','-A'],{timeoutMs:60000});
    const nameStatus=(await git(m.sandboxRoot,['diff','--cached','--name-status','--find-renames','HEAD'],{timeoutMs:60000})).stdout.trim();
    const patch=(await git(m.sandboxRoot,['diff','--cached','--binary','--full-index','--no-ext-diff','HEAD'],{timeoutMs:120000})).stdout;
    await git(m.sandboxRoot,['reset','--mixed','HEAD'],{timeoutMs:60000}).catch(()=>{});
    const bytes=Buffer.byteLength(patch,'utf8');
    if(bytes>this.maxPatchBytes){ const e=new Error(`Verified patch exceeds ${Math.round(this.maxPatchBytes/1024/1024)} MB limit.`);e.code='WT_PATCH_LIMIT';throw e; }
    await fsp.writeFile(this.patchPath(id),patch,'utf8');
    const files=nameStatus?nameStatus.split(/\r?\n/).filter(Boolean).map(line=>{const p=line.split('\t');return {status:p[0],path:p[p.length-1]};}):[];
    m.patch={createdAt:nowIso(),bytes,files,nameStatus,empty:bytes===0};
    m.verification=verification||null; m.status='PATCH_READY';
    await this.writeManifest(m);
    return {success:true,id,status:m.status,patch:m.patch,patchPath:this.patchPath(id)};
  }

  async preview(id,maxChars=24000){
    const m=await this.readManifest(id); let patch='';
    try{patch=await fsp.readFile(this.patchPath(id),'utf8');}catch{}
    return {success:true,id,status:m.status,patch:m.patch||null,text:patch.slice(0,Math.max(1000,Number(maxChars)||24000)),truncated:patch.length>maxChars};
  }

  async applyPatch(id){
    const m=await this.readManifest(id);
    if(m.status!=='PATCH_READY')throw new Error(`Sandbox ${id} is ${m.status}; merge requires PATCH_READY.`);
    const safety=await this.originalStillSafe(m);
    if(!safety.safe){ const e=new Error(`Original workspace changed after sandbox creation (${safety.reason}). Merge blocked.`);e.code='WT_ORIGINAL_CHANGED';e.safety=safety;throw e; }
    const patch=await fsp.readFile(this.patchPath(id),'utf8');
    if(!patch){ m.status='MERGED';m.mergedAt=nowIso();await this.writeManifest(m);return this.public(m); }
    await gitInput(m.repoTop,['apply','--check','--binary','--whitespace=nowarn','-'],patch,{timeoutMs:120000});
    await gitInput(m.repoTop,['apply','--binary','--whitespace=nowarn','-'],patch,{timeoutMs:120000});
    m.status='MERGED';m.mergedAt=nowIso();
    await this.writeManifest(m);
    this.onEvent('Patch Merge',`${id} · ${m.patch?.files?.length||0} verified file(s) merged`,'done','sandbox');
    return this.public(m);
  }

  async markMergeRolledBack(id,reason='Merged patch rolled back by host verification.') {
    const m=await this.readManifest(id);
    m.status='MERGE_ROLLED_BACK';m.abortedAt=nowIso();m.abortReason=String(reason||'');
    await this.writeManifest(m);
    return this.public(m);
  }

  async abort(id,reason='Sandbox aborted.'){
    let m; try{m=await this.readManifest(id);}catch{return {success:false,error:'Sandbox record not found.'};}
    if(!['MERGED','ABORTED','CLEANED'].includes(m.status)){m.status='ABORTED';m.abortedAt=nowIso();m.abortReason=String(reason||'');await this.writeManifest(m);}
    await this.cleanup(id,{keepRecord:true});
    return this.public(await this.readManifest(id));
  }

  async cleanup(id,{keepRecord=true}={}){
    let m; try{m=await this.readManifest(id);}catch{return {success:false,error:'Sandbox record not found.'};}
    try{await git(m.repoTop,['worktree','remove','--force',m.sandboxRoot],{timeoutMs:120000});}catch{await fsp.rm(m.sandboxRoot,{recursive:true,force:true}).catch(()=>{});}
    await git(m.repoTop,['worktree','prune'],{timeoutMs:30000}).catch(()=>{});
    await fsp.rm(m.sandboxRoot,{recursive:true,force:true}).catch(()=>{});
    const activeKey=path.resolve(m.originalWorkspace); const activeSet=this.active.get(activeKey); if(activeSet){activeSet.delete(id); if(activeSet.size)this.active.set(activeKey,activeSet); else this.active.delete(activeKey);}
    if(m.status==='MERGED'){m.status='CLEANED';await this.writeManifest(m);} else if(m.status==='ACTIVE'||m.status==='PATCH_READY'){m.status='ABORTED';m.abortedAt=nowIso();m.abortReason=m.abortReason||'Cleanup without merge.';await this.writeManifest(m);}
    if(!keepRecord){await fsp.rm(this.manifestPath(id),{force:true}).catch(()=>{});await fsp.rm(this.patchPath(id),{force:true}).catch(()=>{});}
    await this.pruneRecords();
    return this.public(m);
  }

  async recoverStale(){
    let names=[];try{names=(await fsp.readdir(this.recordsDir)).filter(x=>x.endsWith('.json'));}catch{return [];}
    const recovered=[];
    for(const n of names){
      try{
        const m=JSON.parse(await fsp.readFile(path.join(this.recordsDir,n),'utf8'));
        if(['ACTIVE','PATCH_READY'].includes(m.status)){
          m.status='ABORTED';m.abortedAt=nowIso();m.abortReason='Recovered stale sandbox after application restart. No patch was merged automatically.';
          await this.writeManifest(m);
          try{await git(m.repoTop,['worktree','remove','--force',m.sandboxRoot],{timeoutMs:60000});}catch{await fsp.rm(m.sandboxRoot,{recursive:true,force:true}).catch(()=>{});}
          await git(m.repoTop,['worktree','prune'],{timeoutMs:30000}).catch(()=>{});
          recovered.push(this.public(m));
        }
      }catch{}
    }
    await this.pruneRecords();
    return recovered;
  }

  async pruneRecords(){
    let rows=[];try{for(const n of await fsp.readdir(this.recordsDir)){if(!n.endsWith('.json'))continue;try{const m=JSON.parse(await fsp.readFile(path.join(this.recordsDir,n),'utf8'));rows.push(m);}catch{}}}catch{return;}
    rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for(const old of rows.slice(this.retention)){
      if(['ACTIVE','PATCH_READY'].includes(old.status))continue;
      await fsp.rm(this.manifestPath(old.id),{force:true}).catch(()=>{});
      await fsp.rm(this.patchPath(old.id),{force:true}).catch(()=>{});
    }
  }

  async list(){
    let rows=[];try{for(const n of await fsp.readdir(this.recordsDir)){if(!n.endsWith('.json'))continue;try{rows.push(this.public(JSON.parse(await fsp.readFile(path.join(this.recordsDir,n),'utf8'))));}catch{}}}catch{}
    rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return {success:true,version:'2.5.1',sandboxes:rows.slice(0,50),active:[...this.active.entries()].flatMap(([workspace,ids])=>[...ids].map(id=>({workspace,id}))),limits:{maxPatchBytes:this.maxPatchBytes,retention:this.retention,requireClean:this.requireClean}};
  }

  status(){
    return {success:true,version:'2.5.1',active:[...this.active.entries()].flatMap(([workspace,ids])=>[...ids].map(id=>({workspace,id}))),recent:this.recent.slice(-20).reverse(),limits:{maxPatchBytes:this.maxPatchBytes,retention:this.retention,requireClean:this.requireClean}};
  }

  public(m){
    return {success:true,id:m.id,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt,originalWorkspace:m.originalWorkspace,repoTop:m.repoTop,baseHead:m.baseHead,sandboxWorkspace:m.sandboxWorkspace,metadata:m.metadata||{},runtimeLinks:(m.runtimeLinks||[]).map(x=>({name:x.name,source:x.source,target:x.target})),patch:m.patch||null,verification:m.verification||null,mergedAt:m.mergedAt||null,abortedAt:m.abortedAt||null,abortReason:m.abortReason||''};
  }
}

module.exports={WorktreeManager,run,git,gitInput};
