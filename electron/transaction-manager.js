const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const DEFAULT_EXCLUDES = new Set([
  '.git','.abdulkarem','node_modules','dist','build','.next','coverage','.venv','venv','__pycache__'
]);

function nowIso(){ return new Date().toISOString(); }
function id(){ return `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }

class TransactionLimitError extends Error {
  constructor(message){ super(message); this.name='TransactionLimitError'; this.code='TX_LIMIT'; }
}

class TransactionManager {
  constructor({onEvent=()=>{},maxFiles=20000,maxBytes=250*1024*1024,retention=20}={}){
    this.onEvent=onEvent;
    this.maxFiles=Math.max(100,Number(maxFiles)||20000);
    this.maxBytes=Math.max(10*1024*1024,Number(maxBytes)||250*1024*1024);
    this.retention=Math.max(3,Number(retention)||20);
    this.activeByWorkspace=new Map();
    this.recent=[];
  }

  rootDir(workspace){ return path.join(path.resolve(workspace),'.abdulkarem','transactions'); }
  txDir(workspace,txId){ return path.join(this.rootDir(workspace),txId); }
  manifestPath(workspace,txId){ return path.join(this.txDir(workspace,txId),'manifest.json'); }
  filesDir(workspace,txId){ return path.join(this.txDir(workspace,txId),'files'); }

  async ensureGitExclude(workspace){
    try{
      const gitDir=path.join(path.resolve(workspace),'.git');
      if(!fs.existsSync(gitDir))return;
      const infoDir=path.join(gitDir,'info'); const p=path.join(infoDir,'exclude');
      await fsp.mkdir(infoDir,{recursive:true});
      let text=''; try{text=await fsp.readFile(p,'utf8');}catch{}
      if(!text.split(/\r?\n/).some(x=>x.trim()==='.abdulkarem/')){
        await fsp.appendFile(p,`${text && !text.endsWith('\n')?'\n':''}.abdulkarem/\n`,'utf8');
      }
    }catch{}
  }

  async scan(workspace,{copyTo=''}={}){
    const base=path.resolve(workspace);
    const files=[]; let totalBytes=0;
    const walk=async(dir,rel='')=>{
      const entries=await fsp.readdir(dir,{withFileTypes:true});
      entries.sort((a,b)=>a.name.localeCompare(b.name));
      for(const e of entries){
        if(DEFAULT_EXCLUDES.has(e.name))continue;
        const abs=path.join(dir,e.name); const r=path.join(rel,e.name);
        if(e.isSymbolicLink())continue;
        if(e.isDirectory()){ await walk(abs,r); continue; }
        if(!e.isFile())continue;
        const st=await fsp.stat(abs);
        totalBytes+=st.size;
        if(files.length+1>this.maxFiles)throw new TransactionLimitError(`Workspace snapshot exceeds ${this.maxFiles} files.`);
        if(totalBytes>this.maxBytes)throw new TransactionLimitError(`Workspace snapshot exceeds ${Math.round(this.maxBytes/1024/1024)} MB.`);
        const buf=await fsp.readFile(abs);
        const row={path:r.replace(/\\/g,'/'),size:st.size,hash:sha256(buf)};
        files.push(row);
        if(copyTo){ const dst=path.join(copyTo,r); await fsp.mkdir(path.dirname(dst),{recursive:true}); await fsp.writeFile(dst,buf); }
      }
    };
    await walk(base,'');
    return {files,totalBytes};
  }

  async begin(workspace,metadata={}){
    if(!workspace)throw new Error('Workspace is required for transaction.');
    const root=path.resolve(workspace);
    const existing=this.activeByWorkspace.get(root);
    if(existing)return this.get(root,existing);
    await this.ensureGitExclude(root);
    const txId=id(); const dir=this.txDir(root,txId); const filesDir=this.filesDir(root,txId);
    await fsp.mkdir(filesDir,{recursive:true});
    this.onEvent('Transaction',`${txId} · creating workspace snapshot`,'running','transaction');
    let snapshot;
    try{ snapshot=await this.scan(root,{copyTo:filesDir}); }
    catch(e){ await fsp.rm(dir,{recursive:true,force:true}).catch(()=>{}); throw e; }
    const manifest={
      id:txId,workspace:root,status:'ACTIVE',createdAt:nowIso(),updatedAt:nowIso(),metadata,
      snapshot:{files:snapshot.files,totalBytes:snapshot.totalBytes},diff:null,verification:null,committedAt:null,rolledBackAt:null
    };
    await this.writeManifest(manifest);
    this.activeByWorkspace.set(root,txId);
    this.onEvent('Transaction',`${txId} · snapshot ${snapshot.files.length} files`,'done','transaction');
    return this.public(manifest);
  }

  async writeManifest(m){
    m.updatedAt=nowIso();
    await fsp.mkdir(this.txDir(m.workspace,m.id),{recursive:true});
    const p=this.manifestPath(m.workspace,m.id); const tmp=`${p}.tmp`;
    await fsp.writeFile(tmp,JSON.stringify(m,null,2),'utf8');
    try{await fsp.rename(tmp,p);}catch{await fsp.copyFile(tmp,p);await fsp.unlink(tmp).catch(()=>{});}
  }

  async readManifest(workspace,txId){
    const p=this.manifestPath(workspace,txId);
    return JSON.parse(await fsp.readFile(p,'utf8'));
  }

  async get(workspace,txId=''){
    const root=path.resolve(workspace);
    const id0=txId||this.activeByWorkspace.get(root);
    if(!id0)return null;
    try{return this.public(await this.readManifest(root,id0));}catch{return null;}
  }

  active(workspace){ const root=path.resolve(workspace||'.'); return this.activeByWorkspace.get(root)||''; }

  async diff(workspace,txId=''){
    const root=path.resolve(workspace); const id0=txId||this.activeByWorkspace.get(root);
    if(!id0)throw new Error('No active transaction for workspace.');
    const m=await this.readManifest(root,id0);
    const current=await this.scan(root);
    const before=new Map((m.snapshot.files||[]).map(x=>[x.path,x]));
    const after=new Map(current.files.map(x=>[x.path,x]));
    const changed=[];
    for(const [p,b] of before){
      const a=after.get(p);
      if(!a)changed.push({path:p,type:'deleted',beforeSize:b.size,afterSize:0});
      else if(a.hash!==b.hash)changed.push({path:p,type:'modified',beforeSize:b.size,afterSize:a.size});
    }
    for(const [p,a] of after){ if(!before.has(p))changed.push({path:p,type:'added',beforeSize:0,afterSize:a.size}); }
    changed.sort((a,b)=>a.path.localeCompare(b.path));
    const summary={changedFiles:changed.length,added:changed.filter(x=>x.type==='added').length,modified:changed.filter(x=>x.type==='modified').length,deleted:changed.filter(x=>x.type==='deleted').length};
    m.diff={at:nowIso(),summary,files:changed.slice(0,500)};
    await this.writeManifest(m);
    return {success:true,id:m.id,workspace:root,status:m.status,summary,files:changed.slice(0,500),truncated:changed.length>500};
  }

  async previewFile(workspace,txId,rel,maxChars=12000){
    const root=path.resolve(workspace); const m=await this.readManifest(root,txId);
    const safe=path.resolve(root,rel); if(safe!==root&&!safe.startsWith(root+path.sep))throw new Error('Path outside workspace.');
    const before=path.join(this.filesDir(root,m.id),rel); const after=safe;
    const read=async(p)=>{try{const st=await fsp.stat(p);if(!st.isFile())return '';if(st.size>1024*1024)return '[binary/large file]';return (await fsp.readFile(p,'utf8')).slice(0,maxChars);}catch{return '';}};
    return {success:true,path:rel,before:await read(before),after:await read(after)};
  }

  async commit(workspace,txId='',verification=null){
    const root=path.resolve(workspace); const id0=txId||this.activeByWorkspace.get(root);
    if(!id0)throw new Error('No active transaction for workspace.');
    const m=await this.readManifest(root,id0);
    const diff=await this.diff(root,id0);
    m.status='COMMITTED';m.committedAt=nowIso();m.verification=verification||null;m.diff={at:nowIso(),summary:diff.summary,files:diff.files};
    await this.writeManifest(m); this.activeByWorkspace.delete(root); this.pushRecent(m); await this.cleanup(root);
    this.onEvent('Transaction',`${m.id} · committed · ${diff.summary.changedFiles} changed files`,'done','transaction');
    return this.public(m);
  }

  async rollback(workspace,txId='',reason='Verification failed'){
    const root=path.resolve(workspace); const id0=txId||this.activeByWorkspace.get(root);
    if(!id0)throw new Error('No active transaction for workspace.');
    const m=await this.readManifest(root,id0);
    const before=new Map((m.snapshot.files||[]).map(x=>[x.path,x]));
    const current=await this.scan(root);
    for(const row of current.files){ if(!before.has(row.path)){ await fsp.rm(path.join(root,row.path),{force:true}).catch(()=>{}); } }
    for(const row of m.snapshot.files||[]){
      const src=path.join(this.filesDir(root,m.id),row.path); const dst=path.join(root,row.path);
      await fsp.mkdir(path.dirname(dst),{recursive:true}); await fsp.copyFile(src,dst);
    }
    m.status='ROLLED_BACK';m.rolledBackAt=nowIso();m.rollbackReason=String(reason||'Rollback');
    await this.writeManifest(m); this.activeByWorkspace.delete(root); this.pushRecent(m); await this.cleanup(root);
    this.onEvent('Transaction',`${m.id} · rollback complete · ${m.rollbackReason}`,'error','transaction');
    return this.public(m);
  }

  pushRecent(m){
    this.recent.push({id:m.id,workspace:m.workspace,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt,committedAt:m.committedAt,rolledBackAt:m.rolledBackAt,diff:m.diff?.summary||null,metadata:m.metadata||{}});
    if(this.recent.length>50)this.recent.splice(0,this.recent.length-50);
  }

  async list(workspace=''){
    const workspaces=workspace?[path.resolve(workspace)]:[...new Set(this.recent.map(x=>x.workspace))];
    const rows=[];
    for(const root of workspaces){
      try{
        const names=(await fsp.readdir(this.rootDir(root),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
        for(const name of names){try{rows.push(this.public(await this.readManifest(root,name)));}catch{}}
      }catch{}
    }
    rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    return {success:true,active:workspace?this.active(workspace):'',transactions:rows.slice(0,50)};
  }

  async recover(workspace){
    const root=path.resolve(workspace); let active=[];
    try{
      const names=(await fsp.readdir(this.rootDir(root),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
      for(const n of names){try{const m=await this.readManifest(root,n);if(m.status==='ACTIVE')active.push(m);}catch{}}
    }catch{}
    active.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    if(active[0])this.activeByWorkspace.set(root,active[0].id);
    return active.map(x=>this.public(x));
  }

  async cleanup(workspace){
    const root=this.rootDir(workspace); let rows=[];
    try{
      const names=(await fsp.readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
      for(const n of names){try{rows.push(await this.readManifest(workspace,n));}catch{}}
    }catch{return;}
    rows=rows.filter(x=>x.status!=='ACTIVE').sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for(const old of rows.slice(this.retention))await fsp.rm(this.txDir(workspace,old.id),{recursive:true,force:true}).catch(()=>{});
  }

  public(m){
    return {success:true,id:m.id,workspace:m.workspace,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt,metadata:m.metadata||{},snapshot:{files:m.snapshot?.files?.length||0,totalBytes:m.snapshot?.totalBytes||0},diff:m.diff||null,verification:m.verification||null,committedAt:m.committedAt||null,rolledBackAt:m.rolledBackAt||null,rollbackReason:m.rollbackReason||''};
  }

  status(){
    return {success:true,version:'2.5.1',active:[...this.activeByWorkspace.entries()].map(([workspace,id])=>({workspace,id})),recent:this.recent.slice(-20).reverse(),limits:{maxFiles:this.maxFiles,maxBytes:this.maxBytes,retention:this.retention}};
  }
}

module.exports={TransactionManager,TransactionLimitError,DEFAULT_EXCLUDES};
