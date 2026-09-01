const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PROVIDERS = Object.freeze({
  github: { label: 'GitHub', command: 'gh' },
  vercel: { label: 'Vercel', command: 'vercel' },
  supabase: { label: 'Supabase', command: 'supabase' }
});

const READ_ACTIONS = Object.freeze({
  github: {
    auth: { args: ['auth','status'], workspace:false },
    repo: { args: ['repo','view','--json','nameWithOwner,url,description,defaultBranchRef'], workspace:true },
    prs: { args: ['pr','list','--limit','20','--json','number,title,state,author,url,headRefName,baseRefName'], workspace:true },
    issues: { args: ['issue','list','--limit','20','--json','number,title,state,author,url,labels'], workspace:true },
    runs: { args: ['run','list','--limit','20','--json','databaseId,displayTitle,status,conclusion,event,workflowName,url,createdAt'], workspace:true }
  },
  vercel: {
    whoami: { args: ['whoami'], workspace:false },
    projects: { args: ['project','ls'], workspace:false }
  },
  supabase: {
    projects: { args: ['projects','list','--output','json'], workspace:false },
    local_status: { args: ['status','-o','json'], workspace:true }
  }
});

const WRITE_ACTION_META = Object.freeze({
  github: {
    push_current: { label:'Push current branch', risk:'medium', workspace:true },
    pr_create: { label:'Create pull request', risk:'medium', workspace:true }
  },
  vercel: {
    deploy_preview: { label:'Deploy Preview', risk:'medium', workspace:true },
    deploy_production: { label:'Deploy Production', risk:'high', workspace:true }
  },
  supabase: {
    db_push: { label:'Push database migrations', risk:'high', workspace:true }
  }
});

function redact(value='') {
  return String(value)
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/sbp_[A-Za-z0-9_-]{20,}/g, '[REDACTED_SUPABASE_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_JWT]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{16,}/gi, 'Bearer [REDACTED]')
    .replace(/(?:token|password|secret|api[_-]?key)\s*[=:]\s*[^\s]+/gi, m => `${m.split(/[=:]/)[0]}=[REDACTED]`);
}

function parseMaybeJson(text='') {
  const s = String(text || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function safeCwd(workspace='') {
  if (!workspace) return undefined;
  const p = path.resolve(String(workspace));
  try { if (fs.statSync(p).isDirectory()) return p; } catch {}
  return undefined;
}

function cleanText(value, max=200) {
  const s = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > max) throw new Error(`Value is too long (max ${max}).`);
  return s;
}

function cleanBranch(value, optional=true) {
  const s = cleanText(value, 180);
  if (!s && optional) return '';
  if (!s || !/^[A-Za-z0-9._\/-]+$/.test(s) || s.includes('..') || s.startsWith('-')) throw new Error('Invalid Git branch name.');
  return s;
}

function displayCommand(executable, args=[]) {
  const q = (v) => { const s=String(v); return /[\s"']/g.test(s) ? `"${s.replace(/"/g,'\\"')}"` : s; };
  return redact([path.basename(executable), ...args].map(q).join(' '));
}

function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

function runProcess(executable, args=[], opts={}) {
  const timeoutMs = Math.max(1000, Math.min(Number(opts.timeoutMs || 20000), 120000));
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ...payload, stdout:redact(stdout).slice(0,120000), stderr:redact(stderr).slice(0,60000), durationMs:Date.now()-started });
    };

    let child;
    try {
      const spawnOpts = { cwd: opts.cwd || undefined, windowsHide:true, env:{...process.env}, stdio:['ignore','pipe','pipe'] };
      if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
        const cmd = process.env.ComSpec || 'cmd.exe';
        const quoted = [executable, ...args].map(v => `"${String(v).replace(/"/g,'""')}"`).join(' ');
        child = spawn(cmd, ['/d','/s','/c', quoted], spawnOpts);
      } else child = spawn(executable, args, spawnOpts);
    } catch (e) { return finish({ success:false, code:null, error:String(e.message || e) }); }

    child.stdout?.on('data', d => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', d => { stderr += d.toString('utf8'); });
    child.on('error', e => finish({ success:false, code:null, error:String(e.message || e) }));
    child.on('close', code => finish({ success:code===0, code, error:code===0?'':redact(stderr || stdout).trim().slice(0,4000) }));
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ success:false, code:null, timeout:true, error:`Timed out after ${timeoutMs} ms` });
    }, timeoutMs);
  });
}

async function resolveCommand(command, runner=runProcess) {
  if (process.platform === 'win32') {
    const r = await runner(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe'), [command], { timeoutMs:4000 });
    if (r.success) {
      const hit = String(r.stdout || '').split(/\r?\n/).map(s=>s.trim()).find(Boolean);
      if (hit) return hit;
    }
  } else {
    const which = fs.existsSync('/usr/bin/which') ? '/usr/bin/which' : 'which';
    const r = await runner(which, [command], { timeoutMs:4000 });
    if (r.success) {
      const hit = String(r.stdout || '').split(/\r?\n/).map(s=>s.trim()).find(Boolean);
      if (hit) return hit;
    }
  }
  return '';
}

async function fallbackWorkspaceFingerprint(cwd) {
  const entries=[];
  const important=[
    'package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','vercel.json',
    path.join('.vercel','project.json'),path.join('supabase','config.toml')
  ];
  for (const rel of important) {
    const p=path.join(cwd,rel);
    try { const b=await fsp.readFile(p); entries.push(`${rel}:${sha(b)}`); } catch {}
  }
  const migrations=path.join(cwd,'supabase','migrations');
  try {
    const names=(await fsp.readdir(migrations,{withFileTypes:true})).filter(x=>x.isFile()).map(x=>x.name).sort().slice(0,500);
    for (const name of names) {
      try { const b=await fsp.readFile(path.join(migrations,name)); entries.push(`supabase/migrations/${name}:${sha(b)}`); } catch {}
    }
  } catch {}
  return sha(entries.join('\n') || cwd);
}

async function hashFile(filePath) {
  return await new Promise((resolve,reject) => {
    const h=crypto.createHash('sha256');
    const rs=fs.createReadStream(filePath);
    rs.on('error',reject); rs.on('data',d=>h.update(d)); rs.on('end',()=>resolve(h.digest('hex')));
  });
}

async function workspaceFingerprint(cwd, gitExe, runner=runProcess) {
  if (gitExe) {
    const head=await runner(gitExe,['rev-parse','HEAD'],{cwd,timeoutMs:5000});
    if (head.success) {
      const [working,staged,untracked,submodules] = await Promise.all([
        runner(gitExe,['diff','--name-only','-z'],{cwd,timeoutMs:10000}),
        runner(gitExe,['diff','--name-only','--cached','-z','HEAD'],{cwd,timeoutMs:10000}),
        runner(gitExe,['ls-files','--others','--exclude-standard','-z'],{cwd,timeoutMs:10000}),
        runner(gitExe,['submodule','status','--recursive'],{cwd,timeoutMs:10000})
      ]);
      const names=new Set();
      for (const r of [working,staged,untracked]) {
        for (const rel of String(r.stdout||'').split('\0').map(x=>x.trim()).filter(Boolean)) names.add(rel);
      }
      const fileStates=[];
      for (const rel of [...names].sort().slice(0,5000)) {
        const target=path.resolve(cwd,rel);
        if (target!==cwd && !target.startsWith(cwd+path.sep)) { fileStates.push(`${rel}:OUTSIDE`); continue; }
        try {
          const st=await fsp.stat(target);
          if (st.isFile()) fileStates.push(`${rel}:${await hashFile(target)}`);
          else fileStates.push(`${rel}:NONFILE`);
        } catch { fileStates.push(`${rel}:MISSING`); }
      }
      if (names.size>5000) fileStates.push(`TOO_MANY_CHANGED_FILES:${names.size}`);
      return sha(`git\n${head.stdout.trim()}\n${fileStates.join('\n')}\nsubmodules:${submodules.stdout||''}`);
    }
  }
  return fallbackWorkspaceFingerprint(cwd);
}

class IntegrationHub {
  constructor({ auditPath, onEvent, runner, resolver, approvalTtlMs }={}) {
    this.auditPath = auditPath || path.join(os.tmpdir(), 'abdulkarem-ai-x-integration-audit.jsonl');
    this.onEvent = typeof onEvent === 'function' ? onEvent : ()=>{};
    this.runner = runner || runProcess;
    this.resolver = resolver || ((cmd)=>resolveCommand(cmd,this.runner));
    this.approvalTtlMs = Math.max(30000, Math.min(Number(approvalTtlMs || 5*60*1000), 30*60*1000));
    this.cache = new Map();
    this.proposals = new Map();
  }

  async _resolve(providerOrCommand) {
    const command = PROVIDERS[providerOrCommand]?.command || providerOrCommand;
    const cached = this.cache.get(command);
    if (cached && Date.now()-cached.at < 30000) return cached.path;
    const found = await this.resolver(command);
    this.cache.set(command, { path:found, at:Date.now() });
    return found;
  }

  async _audit(entry) {
    try {
      await fsp.mkdir(path.dirname(this.auditPath), { recursive:true });
      await fsp.appendFile(this.auditPath, JSON.stringify({ at:new Date().toISOString(), ...entry })+'\n', 'utf8');
    } catch {}
  }

  _publicProposal(p) {
    if (!p) return null;
    return {
      id:p.id, provider:p.provider, action:p.action, label:p.label, risk:p.risk,
      status:p.status, createdAt:p.createdAt, expiresAt:p.expiresAt, workspace:p.workspace,
      command:p.command, effects:p.effects, warnings:p.warnings || [], preflight:p.preflight || null,
      requiresUserApproval:true, agentCanApprove:false
    };
  }

  _prune() {
    const now=Date.now();
    for (const [id,p] of this.proposals) {
      if (p.status==='pending' && p.expiresAtMs <= now) p.status='expired';
      if (now-p.createdAtMs > 24*60*60*1000) this.proposals.delete(id);
    }
  }

  async status({ auth=true }={}) {
    this._prune();
    const items = await Promise.all(Object.keys(PROVIDERS).map(async provider => {
      const executable = await this._resolve(provider);
      if (!executable) return { provider, label:PROVIDERS[provider].label, installed:false, authenticated:false, executable:'', version:'' };
      const vr = await this.runner(executable, ['--version'], { timeoutMs:7000 });
      let authenticated = null;
      let identity = '';
      if (auth) {
        const authAction = provider === 'github' ? 'auth' : provider === 'vercel' ? 'whoami' : 'projects';
        const ar = await this.query(provider, authAction, { audit:false, timeoutMs:provider==='supabase'?12000:8000 });
        authenticated = Boolean(ar.success);
        if (provider === 'vercel' && ar.success) identity = String(ar.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      }
      const firstLine = String(vr.stdout || vr.stderr || '').split(/\r?\n/).find(Boolean) || '';
      return { provider, label:PROVIDERS[provider].label, installed:true, authenticated, executable, version:firstLine.slice(0,240), identity:redact(identity).slice(0,240) };
    }));
    return {
      success:true, providers:items, auditPath:this.auditPath, credentialStorage:'official-cli',
      destructiveActions:false, approvalGatedActions:true, approvalTtlMs:this.approvalTtlMs,
      writeActions:WRITE_ACTION_META, pendingApprovals:[...this.proposals.values()].filter(x=>x.status==='pending').map(x=>this._publicProposal(x))
    };
  }

  async query(provider, action, options={}) {
    const p = String(provider || '').toLowerCase();
    const a = String(action || '').toLowerCase();
    const spec = READ_ACTIONS[p]?.[a];
    if (!spec) return { success:false, provider:p, action:a, error:'Action is not in the read-only allow-list.' };
    const executable = await this._resolve(p);
    if (!executable) return { success:false, provider:p, action:a, installed:false, error:`${PROVIDERS[p]?.label || p} CLI is not installed or not in PATH.` };
    const cwd = spec.workspace ? safeCwd(options.workspace || '') : undefined;
    if (spec.workspace && !cwd) return { success:false, provider:p, action:a, error:'This action requires a valid Workspace directory.' };
    this.onEvent(`${PROVIDERS[p].label} · ${a}`, 'تشغيل استعلام Read-only عبر CLI الرسمي', 'running', 'integration');
    const r = await this.runner(executable, spec.args, { cwd, timeoutMs:options.timeoutMs || 20000 });
    const data = parseMaybeJson(r.stdout);
    const out = { provider:p, action:a, installed:true, readOnly:true, ...r, ...(data !== null ? {data} : {}) };
    if (options.audit !== false) await this._audit({ kind:'read', provider:p, action:a, success:Boolean(r.success), code:r.code, durationMs:r.durationMs, workspace:cwd || '' });
    this.onEvent(`${PROVIDERS[p].label} · ${a}`, r.success ? 'اكتمل الاستعلام' : (r.error || 'فشل الاستعلام'), r.success?'done':'error', 'integration');
    return out;
  }

  async _buildWrite(provider, action, options={}) {
    const meta=WRITE_ACTION_META[provider]?.[action];
    if (!meta) throw new Error('Write action is not allowed.');
    const cwd=meta.workspace ? safeCwd(options.workspace || '') : undefined;
    if (meta.workspace && !cwd) throw new Error('This action requires a valid Workspace directory.');
    const params=options.params && typeof options.params==='object' ? options.params : {};
    let executable='', args=[], effects=[], warnings=[], preflight={};
    const gitExe=await this._resolve('git');

    if (provider==='github' && action==='push_current') {
      if (!gitExe) throw new Error('Git is not installed or not in PATH.');
      const branchR=await this.runner(gitExe,['branch','--show-current'],{cwd,timeoutMs:5000});
      const branch=cleanBranch(branchR.stdout,false);
      const remoteR=await this.runner(gitExe,['remote','get-url','origin'],{cwd,timeoutMs:5000});
      if (!remoteR.success) throw new Error('Git remote "origin" was not found.');
      const statusR=await this.runner(gitExe,['status','--short'],{cwd,timeoutMs:5000});
      const upstreamR=await this.runner(gitExe,['rev-parse','--abbrev-ref','--symbolic-full-name','@{u}'],{cwd,timeoutMs:5000});
      let commits='';
      if (upstreamR.success) {
        const logR=await this.runner(gitExe,['log','--oneline','--max-count','30',`${upstreamR.stdout.trim()}..HEAD`],{cwd,timeoutMs:7000});
        commits=logR.stdout || '';
      }
      executable=gitExe; args=['push','origin',branch];
      effects=[`Push branch ${branch} to origin`, 'Updates the remote repository with local commits'];
      if ((statusR.stdout||'').trim()) warnings.push('Workspace has uncommitted changes. Only committed changes will be pushed.');
      preflight={branch,remote:redact(remoteR.stdout.trim()),upstream:upstreamR.success?upstreamR.stdout.trim():'not configured',commits:redact(commits).slice(0,6000),workingTree:redact(statusR.stdout).slice(0,6000)};
    } else if (provider==='github' && action==='pr_create') {
      executable=await this._resolve('github');
      if (!executable) throw new Error('GitHub CLI is not installed or not in PATH.');
      const title=cleanText(params.title,180); if (!title) throw new Error('PR title is required.');
      const body=cleanText(params.body || '',4000);
      const base=cleanBranch(params.base || '',true); const head=cleanBranch(params.head || '',true);
      args=['pr','create','--title',title,'--body',body || 'Created with ABDULKAREM AI X'];
      if (base) args.push('--base',base); if (head) args.push('--head',head);
      const repoR=await this.runner(executable,['repo','view','--json','nameWithOwner,url,defaultBranchRef'],{cwd,timeoutMs:8000});
      const branchR=gitExe ? await this.runner(gitExe,['branch','--show-current'],{cwd,timeoutMs:5000}) : {success:false,stdout:''};
      effects=[`Creates a new GitHub pull request: ${title}`, `Source branch: ${head || branchR.stdout.trim() || 'current branch'}`, `Base branch: ${base || 'repository default'}`];
      preflight={repo:parseMaybeJson(repoR.stdout)||redact(repoR.stdout),title,base:base||'default',head:head||branchR.stdout.trim()||'current'};
    } else if (provider==='vercel' && (action==='deploy_preview' || action==='deploy_production')) {
      executable=await this._resolve('vercel');
      if (!executable) throw new Error('Vercel CLI is not installed or not in PATH.');
      const production=action==='deploy_production';
      args=['deploy', ...(production?['--prod']:[]), '--yes'];
      let project={};
      try { project=JSON.parse(await fsp.readFile(path.join(cwd,'.vercel','project.json'),'utf8')); } catch {}
      effects=[production?'Deploys this Workspace to the Vercel production environment':'Creates a Vercel preview deployment','Uploads project files according to Vercel CLI rules'];
      warnings.push(production?'Production traffic may change after a successful deployment.':'A new cloud preview deployment will be created.');
      preflight={environment:production?'production':'preview',projectId:project.projectId||'',orgId:project.orgId||'',cwd};
    } else if (provider==='supabase' && action==='db_push') {
      executable=await this._resolve('supabase');
      if (!executable) throw new Error('Supabase CLI is not installed or not in PATH.');
      args=['db','push'];
      const dry=await this.runner(executable,['db','push','--dry-run'],{cwd,timeoutMs:45000});
      effects=['Applies pending local Supabase migrations to the linked remote database','Changes database schema/data only as defined by pending migrations'];
      warnings.push('Database migrations can affect production data. Review the dry-run output before approval.');
      preflight={dryRunSupported:Boolean(dry.success),dryRun:redact(dry.stdout || dry.stderr || dry.error || '').slice(0,16000)};
    } else throw new Error('Write action is not implemented.');

    const fingerprint=await workspaceFingerprint(cwd,gitExe,this.runner);
    return {meta,cwd,executable,args,effects,warnings,preflight,fingerprint};
  }

  async propose(provider, action, options={}) {
    this._prune();
    const p=String(provider||'').toLowerCase(); const a=String(action||'').toLowerCase();
    try {
      const built=await this._buildWrite(p,a,options);
      const now=Date.now(); const id=`apv_${crypto.randomBytes(12).toString('hex')}`;
      const proposal={
        id,provider:p,action:a,label:built.meta.label,risk:built.meta.risk,status:'pending',
        createdAt:new Date(now).toISOString(),createdAtMs:now,expiresAt:new Date(now+this.approvalTtlMs).toISOString(),expiresAtMs:now+this.approvalTtlMs,
        workspace:built.cwd||'',executable:built.executable,args:built.args,command:displayCommand(built.executable,built.args),
        effects:built.effects,warnings:built.warnings,preflight:built.preflight,fingerprint:built.fingerprint
      };
      this.proposals.set(id,proposal);
      await this._audit({kind:'proposal',provider:p,action:a,proposalId:id,status:'pending',risk:proposal.risk,workspace:proposal.workspace,command:proposal.command});
      this.onEvent(`${PROVIDERS[p].label} · ${a}`, 'بانتظار موافقة المستخدم — لم يتم تنفيذ أي تغيير', 'pending', 'approval');
      return {success:true,proposal:this._publicProposal(proposal)};
    } catch(e) {
      await this._audit({kind:'proposal',provider:p,action:a,status:'rejected-before-approval',success:false,error:redact(e.message||e)});
      return {success:false,provider:p,action:a,error:redact(e.message||e)};
    }
  }

  async approvals() {
    this._prune();
    const rows=[...this.proposals.values()].sort((a,b)=>b.createdAtMs-a.createdAtMs).slice(0,100).map(x=>this._publicProposal(x));
    return {success:true,pending:rows.filter(x=>x.status==='pending'),recent:rows};
  }

  async reject(id) {
    this._prune(); const p=this.proposals.get(String(id||''));
    if (!p) return {success:false,error:'Approval request not found.'};
    if (p.status!=='pending') return {success:false,error:`Approval request is ${p.status}.`};
    p.status='rejected'; p.resolvedAt=new Date().toISOString();
    await this._audit({kind:'approval',proposalId:p.id,provider:p.provider,action:p.action,status:'rejected',success:true,workspace:p.workspace});
    this.onEvent(`${PROVIDERS[p.provider].label} · ${p.action}`, 'رفض المستخدم العملية — لم يتم تنفيذ أي تغيير', 'done', 'approval');
    return {success:true,proposal:this._publicProposal(p)};
  }

  async approve(id) {
    this._prune(); const p=this.proposals.get(String(id||''));
    if (!p) return {success:false,error:'Approval request not found.'};
    if (p.status!=='pending') return {success:false,error:`Approval request is ${p.status}.`};
    if (p.expiresAtMs<=Date.now()) { p.status='expired'; return {success:false,error:'Approval request expired. Create a new preview.'}; }

    const gitExe=await this._resolve('git');
    const current=await workspaceFingerprint(p.workspace,gitExe,this.runner);
    if (current!==p.fingerprint) {
      p.status='invalidated';
      await this._audit({kind:'approval',proposalId:p.id,provider:p.provider,action:p.action,status:'invalidated',success:false,workspace:p.workspace,reason:'workspace-changed'});
      return {success:false,error:'Workspace changed after preview. Create a new approval request so the preview matches the exact state.'};
    }

    // Single-use gate: consume before spawning to prevent double-click/race execution.
    p.status='executing'; p.resolvedAt=new Date().toISOString();
    await this._audit({kind:'approval',proposalId:p.id,provider:p.provider,action:p.action,status:'approved',success:true,workspace:p.workspace,command:p.command});
    this.onEvent(`${PROVIDERS[p.provider].label} · ${p.action}`, 'تمت الموافقة الصريحة — بدء التنفيذ', 'running', 'approval');
    const r=await this.runner(p.executable,p.args,{cwd:p.workspace,timeoutMs:p.action==='db_push'?120000:90000});
    p.status=r.success?'executed':'failed'; p.execution={success:r.success,code:r.code,durationMs:r.durationMs,stdout:r.stdout,stderr:r.stderr,error:r.error||''};
    await this._audit({kind:'write',proposalId:p.id,provider:p.provider,action:p.action,status:p.status,success:Boolean(r.success),code:r.code,durationMs:r.durationMs,workspace:p.workspace,command:p.command});
    this.onEvent(`${PROVIDERS[p.provider].label} · ${p.action}`, r.success?'اكتمل التنفيذ بعد الموافقة':(r.error||'فشل التنفيذ'), r.success?'done':'error', 'integration');
    return {success:Boolean(r.success),proposal:this._publicProposal(p),execution:p.execution};
  }

  async audit(limit=100) {
    try {
      const raw = await fsp.readFile(this.auditPath, 'utf8');
      const rows = raw.split(/\r?\n/).filter(Boolean).slice(-Math.max(1,Math.min(Number(limit||100),500))).map(line => { try{return JSON.parse(line)}catch{return null} }).filter(Boolean).reverse();
      return { success:true, auditPath:this.auditPath, entries:rows };
    } catch { return { success:true, auditPath:this.auditPath, entries:[] }; }
  }
}

module.exports = { IntegrationHub, PROVIDERS, READ_ACTIONS, WRITE_ACTION_META, redact, runProcess, workspaceFingerprint };
