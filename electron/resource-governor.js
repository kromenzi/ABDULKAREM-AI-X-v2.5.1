const os = require('os');
const { spawn } = require('child_process');

const GB = 1024 ** 3;

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }
function nowIso() { return new Date().toISOString(); }
function msgChars(messages = []) { return messages.reduce((n, m) => n + String(m?.content || '').length, 0); }

class ResourcePressureError extends Error {
  constructor(message, decision = {}) {
    super(message);
    this.name = 'ResourcePressureError';
    this.code = 'RESOURCE_PRESSURE';
    this.decision = decision;
  }
}

class ResourceGovernor {
  constructor({
    ollamaBase = 'http://127.0.0.1:11434',
    getSettings = () => ({}),
    getInstalledModels = async () => [],
    protectedModels = [],
    onEvent = () => {},
    sampleProvider = null
  } = {}) {
    this.ollamaBase = ollamaBase;
    this.getSettings = getSettings;
    this.getInstalledModels = getInstalledModels;
    this.protectedModels = new Set(protectedModels || []);
    this.onEvent = onEvent;
    this.sampleProvider = sampleProvider;
    this.active = 0;
    this.activeHeavy = 0;
    this.queue = [];
    this.decisions = [];
    this.failures = new Map();
    this.lastSample = null;
    this.lastSampleAt = 0;
  }

  settings() {
    const s = this.getSettings?.() || {};
    return {
      enabled: s.resourceGovernorEnabled !== false,
      autoContext: s.resourceAutoContext !== false,
      autoFallback: s.resourceAutoFallback !== false,
      maxConcurrent: clamp(s.resourceMaxConcurrentModels || 2, 1, 4),
      ramReserveBytes: clamp(s.resourceRamReserveGb || 4, 2, 32) * GB,
      pressureThreshold: clamp(s.resourcePressureThreshold || 0.82, 0.65, 0.95),
      profile: String(s.performanceProfile || 'balanced')
    };
  }

  async _capture(exe, args = [], timeoutMs = 2500) {
    return await new Promise(resolve => {
      let out='', err='', child, done=false;
      try { child=spawn(exe,args,{windowsHide:true}); } catch(e) { return resolve({ok:false,stdout:'',stderr:e.message||String(e)}); }
      const timer=setTimeout(()=>{if(!done){try{child.kill();}catch{}}},timeoutMs);
      child.stdout?.on('data',d=>out+=d.toString()); child.stderr?.on('data',d=>err+=d.toString());
      child.on('error',e=>{if(done)return;done=true;clearTimeout(timer);resolve({ok:false,stdout:out.trim(),stderr:(err+'\n'+(e.message||e)).trim()});});
      child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);resolve({ok:code===0,stdout:out.trim(),stderr:err.trim()});});
    });
  }

  async _gpuProfile() {
    if (process.platform !== 'win32') return [];
    const nv=await this._capture('nvidia-smi.exe',['--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu','--format=csv,noheader,nounits'],2500);
    if(nv.ok && nv.stdout){
      return nv.stdout.split(/\r?\n/).filter(Boolean).map(line=>{const [name,total,free,used,util]=line.split(',').map(x=>x.trim());return {name,totalBytes:Number(total||0)*1024**2,freeBytes:Number(free||0)*1024**2,usedBytes:Number(used||0)*1024**2,utilization:Number(util||0),source:'nvidia-smi'};});
    }
    const ps=`$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress`;
    const r=await this._capture('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],3500);
    if(!r.ok||!r.stdout)return [];
    try { const parsed=JSON.parse(r.stdout); const rows=Array.isArray(parsed)?parsed:[parsed]; return rows.filter(Boolean).map(x=>({name:String(x.Name||''),totalBytes:Number(x.AdapterRAM||0)||0,freeBytes:null,usedBytes:null,utilization:null,source:'wmi'})); } catch { return []; }
  }

  async _ollamaRunning() {
    try {
      const r = await fetch(`${this.ollamaBase}/api/ps`, { signal: AbortSignal.timeout(1800) });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.models || []).map(x => ({
        name: x.name || x.model || '',
        size: Number(x.size || 0),
        sizeVram: Number(x.size_vram || 0),
        expiresAt: x.expires_at || null
      }));
    } catch { return []; }
  }

  async sample(force = false) {
    if (!force && this.lastSample && Date.now() - this.lastSampleAt < 1200) return this.lastSample;
    if (this.sampleProvider) {
      const custom = await this.sampleProvider();
      this.lastSample = { ...custom, sampledAt: custom.sampledAt || nowIso() };
      this.lastSampleAt = Date.now();
      return this.lastSample;
    }
    const [installed, running, gpus] = await Promise.all([this.getInstalledModels(), this._ollamaRunning(), this._gpuProfile()]);
    const total = os.totalmem();
    const free = os.freemem();
    const used = Math.max(0, total - free);
    const load = os.loadavg?.()[0] || 0;
    const cpuCount = Math.max(1, os.cpus()?.length || 1);
    const sample = {
      sampledAt: nowIso(),
      ram: { totalBytes: total, freeBytes: free, usedBytes: used, pressure: total ? used / total : 0 },
      cpu: { load1m: load, cores: cpuCount, normalizedLoad: clamp(load / cpuCount, 0, 2) },
      gpu: { devices:gpus, maxTotalBytes:Math.max(0,...gpus.map(g=>Number(g.totalBytes||0))), maxFreeBytes:Math.max(0,...gpus.map(g=>Number(g.freeBytes||0))) },
      process: { rssBytes: process.memoryUsage?.().rss || 0 },
      installedModels: installed,
      runningModels: running
    };
    this.lastSample = sample;
    this.lastSampleAt = Date.now();
    return sample;
  }

  modelInfo(model, sample) {
    const rows = sample?.installedModels || [];
    return rows.find(x => String(x.name || '').toLowerCase() === String(model || '').toLowerCase()) || { name:model, size:0 };
  }

  baseContext(kind, profile) {
    const table = {
      eco: { general:4096, coding:6144, vision:4096 },
      balanced: { general:8192, coding:12288, vision:8192 },
      max: { general:16384, coding:24576, vision:12288 }
    };
    const row = table[profile] || table.balanced;
    return row[kind] || row.general;
  }

  async preflight({ model, kind = 'general', messages = [], requestedContext = 0 } = {}) {
    const settings = this.settings();
    const sample = await this.sample();
    const info = this.modelInfo(model, sample);
    const modelBytes = Number(info.size || 0);
    const ram = sample.ram || { totalBytes:0, freeBytes:0, pressure:0 };
    const alreadyRunning = (sample.runningModels || []).some(x => String(x.name).toLowerCase() === String(model).toLowerCase());
    const failure = this.failures.get(String(model).toLowerCase()) || null;
    let ctx = requestedContext > 0 ? Number(requestedContext) : this.baseContext(kind, settings.profile);
    const pressure = Number(ram.pressure || 0);
    const reserve = settings.ramReserveBytes;
    const usableFree = Math.max(0, Number(ram.freeBytes || 0) - reserve);

    if (settings.autoContext) {
      if (pressure >= 0.90 || usableFree < 3 * GB) ctx = Math.min(ctx, 4096);
      else if (pressure >= settings.pressureThreshold || usableFree < 7 * GB) ctx = Math.min(ctx, 8192);
      if (modelBytes >= 16 * GB && settings.profile !== 'max') ctx = Math.min(ctx, 8192);
      if (modelBytes >= 10 * GB && usableFree < 12 * GB) ctx = Math.min(ctx, 6144);
      if (failure?.oomUntil && failure.oomUntil > Date.now()) ctx = Math.min(ctx, 4096);
    }
    ctx = clamp(ctx, 2048, 32768);

    const chars = msgChars(messages);
    const estimatedPromptTokens = Math.ceil(chars / 4);
    const maxPromptTokens = Math.max(1024, Math.floor(ctx * 0.72));
    const heavy = modelBytes >= 10 * GB || /(?:30b|32b|26b|70b)/i.test(String(model));
    const estimatedColdLoad = alreadyRunning ? 0 : Math.ceil(modelBytes * 1.12);
    const estimatedKvReserve = Math.ceil((ctx / 8192) * (heavy ? 1.8 : 0.9) * GB);
    const estimatedAdditionalBytes = estimatedColdLoad + estimatedKvReserve;
    const hardPressure = pressure >= 0.94 || Number(ram.freeBytes || 0) < reserve + 1.5 * GB;
    const insufficientColdLoad = !alreadyRunning && modelBytes > 0 && estimatedAdditionalBytes > Math.max(usableFree * 1.35, usableFree + 2 * GB);
    const blocked = settings.enabled && (hardPressure || insufficientColdLoad);

    const reasons = [];
    if (alreadyRunning) reasons.push('model already resident');
    if (heavy) reasons.push('heavy model serialized');
    if (pressure >= settings.pressureThreshold) reasons.push(`RAM pressure ${(pressure*100).toFixed(0)}%`);
    if (ctx < this.baseContext(kind, settings.profile)) reasons.push(`context reduced to ${ctx}`);
    if (failure?.oomUntil && failure.oomUntil > Date.now()) reasons.push('recent OOM cooldown');
    if (blocked) reasons.push(hardPressure ? 'critical RAM reserve reached' : 'cold-load estimate exceeds safe free RAM');
    if (!reasons.length) reasons.push('resources within configured envelope');

    const decision = {
      at: nowIso(), model, kind, enabled:settings.enabled, blocked, heavy, alreadyRunning,
      contextWindow: ctx,
      maxPromptTokens,
      maxPromptChars: maxPromptTokens * 4,
      estimatedPromptTokens,
      modelBytes,
      ramFreeBytes:Number(ram.freeBytes || 0), ramTotalBytes:Number(ram.totalBytes || 0), ramPressure:pressure,
      estimatedAdditionalBytes,
      queueClass: heavy ? 'heavy' : 'normal',
      reason: reasons.join(' · ')
    };
    this._rememberDecision(decision);
    return decision;
  }

  _rememberDecision(d) {
    this.decisions.push(d);
    if (this.decisions.length > 80) this.decisions.splice(0, this.decisions.length - 80);
  }

  recordFailure(model, error) {
    const text = String(error?.message || error || '');
    if (!/out of memory|failed to allocate|memory allocation|cuda.*memory|vulkan.*memory|pinned memory|RESOURCE_PRESSURE/i.test(text)) return;
    const key = String(model || '').toLowerCase();
    const prev = this.failures.get(key) || { count:0 };
    this.failures.set(key, { count:prev.count + 1, lastAt:Date.now(), oomUntil:Date.now() + 5*60*1000, lastError:text.slice(0,500) });
  }

  clearFailure(model) { this.failures.delete(String(model || '').toLowerCase()); }

  async run({ model, kind = 'general', messages = [], requestedContext = 0, task } = {}) {
    if (typeof task !== 'function') throw new Error('ResourceGovernor task is required.');
    const decision = await this.preflight({model,kind,messages,requestedContext});
    if (decision.blocked) throw new ResourcePressureError(`Resource Governor blocked ${model}: ${decision.reason}`, decision);
    if (!this.settings().enabled) return task(decision);
    return new Promise((resolve, reject) => {
      this.queue.push({ model, kind, decision, task, resolve, reject, queuedAt:Date.now() });
      this._drain();
    });
  }

  _drain() {
    const max = this.settings().maxConcurrent;
    if (this.activeHeavy > 0 || this.active >= max || !this.queue.length) return;
    if (this.active > 0 && this.queue[0]?.decision?.heavy) return;
    let index = this.active > 0 ? this.queue.findIndex(item => !item.decision.heavy) : 0;
    if (index < 0) return;
    const item = this.queue[index];
    if (item.decision.heavy && this.active > 0) return;
    this.queue.splice(index,1);
    this.active += 1;
    if (item.decision.heavy) this.activeHeavy += 1;
    const waitMs = Date.now() - item.queuedAt;
    if (waitMs > 80) this.onEvent('Resource Queue', `${item.model} waited ${waitMs} ms`, 'done', 'resource');
    Promise.resolve()
      .then(() => item.task(item.decision))
      .then(v => { this.clearFailure(item.model); item.resolve(v); })
      .catch(e => { this.recordFailure(item.model,e); item.reject(e); })
      .finally(() => {
        this.active = Math.max(0, this.active - 1);
        if (item.decision.heavy) this.activeHeavy = Math.max(0, this.activeHeavy - 1);
        this._drain();
      });
    this._drain();
  }

  async status() {
    const sample = await this.sample(true);
    const settings = this.settings();
    return {
      success:true,
      enabled:settings.enabled,
      settings,
      sampledAt:sample.sampledAt,
      ram:sample.ram,
      cpu:sample.cpu,
      gpu:sample.gpu || {devices:[],maxTotalBytes:0,maxFreeBytes:0},
      process:sample.process,
      runningModels:sample.runningModels || [],
      queue:{pending:this.queue.length,active:this.active,activeHeavy:this.activeHeavy,maxConcurrent:settings.maxConcurrent},
      recentDecisions:this.decisions.slice(-12).reverse(),
      oomCooldowns:[...this.failures.entries()].map(([model,x])=>({model,count:x.count,until:new Date(x.oomUntil).toISOString(),lastError:x.lastError})).filter(x=>Date.parse(x.until)>Date.now()),
      protectedModels:[...this.protectedModels]
    };
  }
}

module.exports = { ResourceGovernor, ResourcePressureError };
