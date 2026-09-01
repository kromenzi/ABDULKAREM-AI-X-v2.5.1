const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const assert=require('assert');
const {normalizeEol}=require('./test-utils');
const {TransactionManager}=require('../electron/transaction-manager');

(async()=>{
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-tx-'));
  await fsp.mkdir(path.join(root,'src'),{recursive:true});
  await fsp.writeFile(path.join(root,'src','a.txt'),'alpha\n','utf8');
  await fsp.writeFile(path.join(root,'keep.txt'),'keep\n','utf8');
  const txm=new TransactionManager({maxFiles:100,maxBytes:10*1024*1024,retention:5});

  const t1=await txm.begin(root,{reason:'test rollback'});
  assert.equal(t1.status,'ACTIVE');
  await fsp.writeFile(path.join(root,'src','a.txt'),'changed\n','utf8');
  await fsp.writeFile(path.join(root,'new.txt'),'new\n','utf8');
  await fsp.rm(path.join(root,'keep.txt'));
  const d1=await txm.diff(root,t1.id);
  assert.equal(d1.summary.changedFiles,3);
  assert.equal(d1.summary.added,1);
  assert.equal(d1.summary.modified,1);
  assert.equal(d1.summary.deleted,1);
  const p=await txm.previewFile(root,t1.id,path.join('src','a.txt'));
  assert(p.before.includes('alpha'));
  assert(p.after.includes('changed'));
  const r=await txm.rollback(root,t1.id,'forced test');
  assert.equal(r.status,'ROLLED_BACK');
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('alpha\n'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'keep.txt'),'utf8')),normalizeEol('keep\n'));
  assert.equal(fs.existsSync(path.join(root,'new.txt')),false);

  const t2=await txm.begin(root,{reason:'test commit'});
  await fsp.writeFile(path.join(root,'src','a.txt'),'verified\n','utf8');
  const c=await txm.commit(root,t2.id,{success:true,gate:'test'});
  assert.equal(c.status,'COMMITTED');
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('verified\n'));
  const list=await txm.list(root);
  assert(list.transactions.some(x=>x.id===t1.id&&x.status==='ROLLED_BACK'));
  assert(list.transactions.some(x=>x.id===t2.id&&x.status==='COMMITTED'));

  const t3=await txm.begin(root,{reason:'crash recovery'});
  const txm2=new TransactionManager({maxFiles:100,maxBytes:10*1024*1024});
  const recovered=await txm2.recover(root);
  assert(recovered.some(x=>x.id===t3.id));
  assert.equal(txm2.active(root),t3.id);
  await txm2.rollback(root,t3.id,'cleanup');

  const limitRoot=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-tx-limit-'));
  for(let i=0;i<101;i++) await fsp.writeFile(path.join(limitRoot,`f${i}.txt`),'x','utf8');
  const limited=new TransactionManager({maxFiles:100,maxBytes:10*1024*1024});
  let limitBlocked=false;
  try{await limited.begin(limitRoot,{reason:'limit test'});}catch(e){limitBlocked=e.code==='TX_LIMIT';}
  assert.equal(limitBlocked,true);
  await fsp.rm(limitRoot,{recursive:true,force:true});

  await fsp.rm(root,{recursive:true,force:true});
  console.log('transaction-manager.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
