import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Bot, BrainCircuit, ChevronDown, Code2, FileSearch, Files, FolderOpen,
  Image as ImageIcon, Loader2, MessageSquare, MonitorPlay, Paperclip,
  Play, Save, Search, Send, ShieldCheck, Sparkles, SquareTerminal,
  WandSparkles, KeyRound, Copy, RefreshCw, X, CheckCircle2,
  ScanText, GitCompare, Info, Trash2, Database, BookOpen, HardDrive, Eraser,
  Globe2, ExternalLink, Gauge, ShieldAlert, GitBranch, GitCommit, Bug, CircleStop,
  PlayCircle, Eye, Camera, RefreshCcw, TestTube2, FileCode2, PanelBottom, PanelTop,
  Braces, RotateCw, CheckCheck, Settings, Activity, Download, Upload, Archive, PackageCheck, HeartPulse, ListChecks, PauseCircle
} from 'lucide-react';
import './styles.css';

const Editor = React.lazy(() => import('@monaco-editor/react'));

const MODES = [
  { id: 'chat', label: 'مساعد', icon: MessageSquare },
  { id: 'research', label: 'بحث عميق', icon: Search },
  { id: 'office', label: 'Office', icon: Files },
  { id: 'knowledge', label: 'قاعدة المعرفة', icon: Database },
  { id: 'memory', label: 'الذاكرة', icon: BrainCircuit },
  { id: 'workflow', label: 'سير العمل', icon: ListChecks },
  { id: 'automation', label: 'الأتمتة', icon: Activity },
  { id: 'code', label: 'برمجة', icon: Code2 },
];

function basename(p = '') { return String(p).split(/[\\/]/).pop() || p; }
function humanBytes(n = 0) {
  if (!Number.isFinite(Number(n))) return '—';
  const value = Number(n);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function monacoLanguage(file='') {
  const ext=(String(file).split('.').pop()||'').toLowerCase();
  return ({js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',json:'json',py:'python',html:'html',css:'css',scss:'scss',md:'markdown',yml:'yaml',yaml:'yaml',sql:'sql',ps1:'powershell',sh:'shell',java:'java',cs:'csharp',cpp:'cpp',c:'c',go:'go',rs:'rust',php:'php',rb:'ruby'}[ext]||'plaintext');
}

function App() {
  const [mode, setMode] = useState('chat');
  const [workspace, setWorkspace] = useState('');
  const [files, setFiles] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [fileInsights, setFileInsights] = useState({});
  const [activeAttachment, setActiveAttachment] = useState('');
  const [rightTab, setRightTab] = useState('activity');
  const [dropActive, setDropActive] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'هلا. أنا ABDULKAREM AI X. عطِني ملف، صورة، مشروع، أو موضوع بحث وبأتعامل معه بالأداة المناسبة بدل التخمين.' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState([]);
  const [models, setModels] = useState([]);
  const [systemProfile, setSystemProfile] = useState(null);
  const [modelPlan, setModelPlan] = useState(null);
  const [resourceInfo, setResourceInfo] = useState({success:false,enabled:true,ram:{},cpu:{},queue:{pending:0,active:0,activeHeavy:0,maxConcurrent:2},recentDecisions:[],oomCooldowns:[]});
  const [intelligenceInfo, setIntelligenceInfo] = useState({success:false,version:'2.5.1',enabled:true,registry:{agents:[],toolGroups:{},skills:[],invariants:{}},stats:{plans:0,teamPlans:0,singlePlans:0,gateFailures:0},recentPlans:[],policies:{autoTeam:true,maxAgents:5,verificationGate:true}});
  const [dagInfo, setDagInfo] = useState({success:false,version:'2.5.1',activeRuns:[],stats:{},recentRuns:[],locks:{owners:[],waiting:[]}});
  const [transactionInfo, setTransactionInfo] = useState({success:true,active:'',transactions:[]});
  const [worktreeInfo, setWorktreeInfo] = useState({success:true,version:'2.5.1',active:[],sandboxes:[]});
  const [laneInfo, setLaneInfo] = useState({success:true,version:'2.5.1',active:[],bundles:[]});
  const [evaluationInfo, setEvaluationInfo] = useState({success:false,version:'2.5.1',running:false,baseline:null,lastRun:null,recentRuns:[],toolMetrics:[],suites:[]});
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const [lastIntelligence, setLastIntelligence] = useState(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [status, setStatus] = useState({ ollama: false, version: '' });
  const [routeInfo, setRouteInfo] = useState(null);
  const [verification, setVerification] = useState(null);
  const [apiInfo, setApiInfo] = useState({ running:false, baseUrl:'', apiKey:'', modelAlias:'abdulkarem-ai' });
  const [apiOpen, setApiOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [selectedFileText, setSelectedFileText] = useState('');
  const [knowledge, setKnowledge] = useState({ documents:0, chunks:0, embedded_chunks:0, hybrid_ready:false, embedding_model:'' });
  const [knowledgeResults, setKnowledgeResults] = useState([]);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState({total:0,global:0,project:0,kinds:{}});
  const [memoryItems, setMemoryItems] = useState([]);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [researchLevel, setResearchLevel] = useState('deep');
  const [researchStatus, setResearchStatus] = useState({ providers:{}, browser_reader:false });
  const [researchSources, setResearchSources] = useState([]);
  const [researchMeta, setResearchMeta] = useState(null);
  const [codeFile, setCodeFile] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [codeDirty, setCodeDirty] = useState(false);
  const [projectInfo, setProjectInfo] = useState(null);
  const [projectState, setProjectState] = useState({running:false,logs:[],url:''});
  const [projectCheck, setProjectCheck] = useState(null);
  const [gitState, setGitState] = useState({status:'',diff:'',log:''});
  const [codeBottomTab, setCodeBottomTab] = useState('terminal');
  const [previewInspect, setPreviewInspect] = useState(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [teamMode, setTeamMode] = useState(false);
  const [agentsStatus, setAgentsStatus] = useState({agents:[],skills:[],mcp:{configured:0,enabled:0,connected:[],servers:[]}});
  const [agentRuns, setAgentRuns] = useState(null);
  const [appSettings, setAppSettings] = useState({appearance:'dark',accent:'blue',language:'ar-SA',teamMode:false,researchLevel:'deep',autoBackup:true,backupKeep:5,compactSidebar:false,showVerification:true,startupHealthCheck:true,performanceProfile:'balanced',preferredGeneralModel:'auto',preferredCodingModel:'auto',preferredVisionModel:'auto',memoryEnabled:true,memoryAutoCapture:true,memoryMaxContextChars:12000,backgroundMode:true,minimizeToTray:true,launchAtStartup:false,trayNotifications:true,crashRecovery:true,rendererAutoRecover:true,sessionRestore:true,resourceGovernorEnabled:true,resourceAutoContext:true,resourceAutoFallback:true,resourceMaxConcurrentModels:2,resourceRamReserveGb:4,resourcePressureThreshold:0.82,intelligenceEnabled:true,intelligenceAutoTeam:true,intelligenceVerificationGate:true,intelligenceMaxAgents:5,intelligenceParallelExecution:true,intelligenceMaxParallel:3,intelligenceMutationLockTimeoutMs:120000,transactionalWorkspaceEnabled:true,transactionAutoRollback:true,transactionIncludeTests:false,transactionMaxFiles:20000,transactionMaxMb:250,worktreeSandboxEnabled:true,worktreeMaxPatchMb:32,parallelCodingLanesEnabled:true,parallelCodingLaneCount:2,laneMaxBundleMb:64,evaluationReleaseGateEnabled:true,evaluationRegressionThreshold:8,evaluationLiveModelProbes:false});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [integrationStatus, setIntegrationStatus] = useState({success:true,providers:[],destructiveActions:false});
  const [integrationAudit, setIntegrationAudit] = useState([]);
  const [integrationApprovals, setIntegrationApprovals] = useState([]);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const [integrationResult, setIntegrationResult] = useState(null);
  const [workflowState, setWorkflowState] = useState({success:true,templates:[],workflows:[]});
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [automationState, setAutomationState] = useState({success:true,automations:[],runs:[],running:0,queued:0,enabled:0,total:0,waitingApproval:0,concurrency:1});
  const [automationBusy, setAutomationBusy] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState({success:false,trayActive:false,windowVisible:true,startupEnabled:false,startupRequested:false,schedulerRunning:true,automations:{enabled:0,running:0,queued:0,waitingApproval:0}});
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState({success:false,safeMode:false,previousUnclean:false,crashCount5m:0,rendererCrashCount5m:0,rendererRestarts:0,workerFailures:0,recoveries:0});
  const scrollRef = useRef(null);
  const sessionRestoredRef = useRef(false);

  useEffect(() => {
    const boot = async () => {
      try {
        if (!sessionRestoredRef.current) {
          sessionRestoredRef.current = true;
          const [rec, recStatus] = await Promise.all([window.abdx.recoverySessionGet?.(), window.abdx.recoveryStatus?.()]);
          if (recStatus) setRecoveryInfo(recStatus);
          const saved = rec?.session;
          if (saved && !rec?.safeMode) {
            if (saved.mode) setMode(saved.mode);
            if (saved.rightTab) setRightTab(saved.rightTab);
            if (saved.selectedModel) setSelectedModel(saved.selectedModel);
            if (saved.workspace && !workspace) {
              try { const listed = await window.abdx.listWorkspace(saved.workspace); setWorkspace(saved.workspace); setFiles(listed || []); } catch {}
            }
            if (saved.codeFile) setCodeFile(saved.codeFile);
          }
        }
        const s = await window.abdx.systemStatus();
        setStatus(s);
        const m = await window.abdx.models();
        setModels(m || []);
        const [profile, plan] = await Promise.all([window.abdx.modelProfile?.(), window.abdx.modelPlan?.()]);
        if (profile) setSystemProfile(profile);
        if (plan) setModelPlan(plan);
        const resources = await window.abdx.resourceStatus?.();
        if (resources) setResourceInfo(resources);
        const intel = await window.abdx.intelligenceStatus?.();
        if (intel) setIntelligenceInfo(intel);
        const dag = await window.abdx.dagStatus?.();
        if (dag) setDagInfo(dag);
        const txs = await window.abdx.transactionsStatus?.(workspace || '');
        if (txs) setTransactionInfo(txs);
        const wts = await window.abdx.worktreesStatus?.();
        if (wts) setWorktreeInfo(wts);
        const lanes = await window.abdx.lanesStatus?.();
        if (lanes) setLaneInfo(lanes);
        const evals = await window.abdx.evaluationsStatus?.();
        if (evals) setEvaluationInfo(evals);
        const api = await window.abdx.apiStatus();
        setApiInfo(api || {});
        const kb = await window.abdx.knowledgeStatus();
        setKnowledge(kb || {});
        const ms = await window.abdx.memoryStatus?.(workspace || '');
        if (ms) setMemoryStatus(ms);
        const ml = await window.abdx.memoryList?.({project:workspace || '',limit:80});
        if (ml) setMemoryItems(ml.results || []);
        const rs = await window.abdx.researchStatus();
        setResearchStatus(rs || { providers:{} });
        const ag = await window.abdx.agentsStatus?.();
        if (ag) setAgentsStatus(ag);
        const prefs = await window.abdx.settingsGet?.();
        if (prefs) { setAppSettings(prefs); setTeamMode(Boolean(prefs.teamMode)); setResearchLevel(prefs.researchLevel || 'deep'); }
        const bks = await window.abdx.backupList?.();
        if (bks) setBackups(bks);
        const upd = await window.abdx.updateStatus?.();
        if (upd) setUpdateInfo(upd);
        const ints = await window.abdx.integrationsStatus?.({auth:false});
        if (ints) setIntegrationStatus(ints);
        const ia = await window.abdx.integrationsAudit?.(80);
        if (ia) setIntegrationAudit(ia.entries || []);
        const ap = await window.abdx.integrationsApprovals?.();
        if (ap) setIntegrationApprovals(ap.pending || []);
        const wf = await window.abdx.workflowsList?.();
        if (wf) setWorkflowState(wf);
        const autos = await window.abdx.automationsList?.();
        if (autos) setAutomationState(autos);
        const rt = await window.abdx.runtimeStatus?.();
        if (rt) setRuntimeInfo(rt);
        const rc = await window.abdx.recoveryStatus?.();
        if (rc) setRecoveryInfo(rc);
        if (prefs?.startupHealthCheck) { window.abdx.diagnosticsRun?.().then(setDiagnostics).catch(()=>{}); }
      } catch {}
    };
    boot();
    const off = window.abdx.onAgentEvent((evt) => setEvents(prev => [...prev.slice(-59), evt]));
    const offProject = window.abdx.onProjectEvent?.((evt) => {
      if (!evt?.root || !workspace || evt.root === workspace) {
        setProjectState(prev => ({ ...prev, ...(evt.url ? {url:evt.url} : {}) }));
      }
    });
    const offRuntime = window.abdx.onRuntimeNavigate?.((evt) => { if(evt?.mode) setMode(evt.mode); });
    return () => { off?.(); offProject?.(); offRuntime?.(); };
  }, [workspace]);

  useEffect(() => {
    if (mode !== 'code' || !workspace) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [info, st] = await Promise.all([window.abdx.inspectProject(workspace), window.abdx.projectStatus(workspace)]);
        if (!cancelled) { setProjectInfo(info); setProjectState(st || {running:false,logs:[],url:''}); }
      } catch {}
    };
    refresh();
    const timer = setInterval(async () => {
      try { const st = await window.abdx.projectStatus(workspace); if (!cancelled) setProjectState(st || {}); } catch {}
    }, 1200);
    return () => { cancelled = true; clearInterval(timer); };
  }, [mode, workspace]);

  useEffect(() => {
    if (mode !== 'workflow') return;
    let cancelled=false;
    const refresh=async()=>{ try { const wf=await window.abdx.workflowsList?.(); if(!cancelled&&wf)setWorkflowState(wf); } catch {} };
    refresh(); const timer=setInterval(refresh,1200);
    return()=>{cancelled=true;clearInterval(timer);};
  }, [mode]);

  useEffect(() => {
    if (mode !== 'automation') return;
    let cancelled=false;
    const refresh=async()=>{ try { const a=await window.abdx.automationsList?.(); if(!cancelled&&a)setAutomationState(a); } catch {} };
    refresh(); const timer=setInterval(refresh,1800);
    return()=>{cancelled=true;clearInterval(timer);};
  }, [mode]);

  useEffect(() => {
    if (!busy) { window.abdx.dagStatus?.().then(r=>r&&setDagInfo(r)).catch(()=>{}); return; }
    let cancelled=false;
    const refresh=async()=>{ try{const r=await window.abdx.dagStatus?.();if(!cancelled&&r)setDagInfo(r);}catch{} };
    refresh(); const timer=setInterval(refresh,900);
    return()=>{cancelled=true;clearInterval(timer);};
  }, [busy]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, events]);

  useEffect(() => {
    document.documentElement.dataset.accent = appSettings.accent || 'blue';
    document.documentElement.dataset.appearance = appSettings.appearance || 'dark';
  }, [appSettings.accent, appSettings.appearance]);

  useEffect(() => {
    if (!sessionRestoredRef.current || appSettings.sessionRestore === false) return;
    const timer=setTimeout(()=>window.abdx.recoverySessionSave?.({mode,workspace,rightTab,selectedModel,codeFile}).catch(()=>{}),650);
    return()=>clearTimeout(timer);
  }, [mode,workspace,rightTab,selectedModel,codeFile,appSettings.sessionRestore]);

  const chooseWorkspace = async () => {
    const selectedPath = await window.abdx.selectFolder();
    if (!selectedPath) return;
    setWorkspace(selectedPath);
    const listed = await window.abdx.listWorkspace(selectedPath);
    setFiles(listed || []);
  };

  const inspectAttachment = async (filePath) => {
    setActiveAttachment(filePath);
    setRightTab('files');
    if (fileInsights[filePath]?.success) return fileInsights[filePath];
    try {
      const info = await window.abdx.inspectFile(filePath);
      setFileInsights(prev => ({ ...prev, [filePath]: info }));
      return info;
    } catch (e) {
      const info = { success:false, path:filePath, name:basename(filePath), error:e.message || String(e) };
      setFileInsights(prev => ({ ...prev, [filePath]: info }));
      return info;
    }
  };

  const addAttachments = async (paths) => {
    const unique = [...new Set((paths || []).filter(Boolean))];
    if (!unique.length) return;
    setAttachments(prev => [...new Set([...prev, ...unique])]);
    setCompareResult(null);
    setActiveAttachment(unique[0]);
    setRightTab('files');
    for (const p of unique.slice(0, 12)) inspectAttachment(p);
  };

  const pickFiles = async () => {
    const selected = await window.abdx.selectFiles();
    await addAttachments(selected || []);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDropActive(false);
    const dropped = [...(e.dataTransfer?.files || [])].map(f => f.path).filter(Boolean);
    if (dropped.length) await addAttachments(dropped);
  };

  const removeAttachment = (p) => {
    setAttachments(prev => prev.filter(x => x !== p));
    if (activeAttachment === p) setActiveAttachment('');
    setCompareResult(null);
  };

  const compareAttached = async () => {
    if (attachments.length < 2 || compareBusy) return;
    setCompareBusy(true);
    setRightTab('files');
    try {
      const result = await window.abdx.compareFiles(attachments.slice(0, 5));
      setCompareResult(result);
      const summary = (result.comparisons || []).map((c, i) =>
        `مقارنة ${i + 1}: ${(c.similarity * 100).toFixed(1)}% تشابه · مختلف من الأساس ${c.only_in_base?.length || 0} · مختلف في الملف الآخر ${c.only_in_other?.length || 0}`
      ).join('\n');
      setSelectedFileText(summary || JSON.stringify(result, null, 2));
    } catch (e) {
      setSelectedFileText(`فشل المقارنة: ${e.message || e}`);
    } finally { setCompareBusy(false); }
  };


  const refreshKnowledge = async () => {
    try { const kb = await window.abdx.knowledgeStatus(); setKnowledge(kb || {}); return kb; } catch { return null; }
  };

  const indexKnowledge = async (paths) => {
    const targets = [...new Set((paths || []).filter(Boolean))];
    if (!targets.length || knowledgeBusy) return;
    setKnowledgeBusy(true); setRightTab('knowledge');
    try {
      const result = await window.abdx.knowledgeIndex(targets);
      await refreshKnowledge();
      setSelectedFileText(`Knowledge Base: indexed ${result.indexed?.length || 0} files · new chunks ${result.new_chunks || 0} · embeddings ${result.embedded || 0}`);
    } catch (e) {
      setSelectedFileText(`فشل الفهرسة: ${e.message || e}`);
    } finally { setKnowledgeBusy(false); }
  };

  const directKnowledgeSearch = async (q) => {
    const query = String(q || input || '').trim();
    if (!query || knowledgeBusy) return;
    setKnowledgeBusy(true); setRightTab('knowledge');
    try {
      const result = await window.abdx.knowledgeSearch(query);
      setKnowledgeResults(result.results || []);
    } catch (e) {
      setKnowledgeResults([{ citation:'ERR', name:'Search error', snippet:e.message || String(e) }]);
    } finally { setKnowledgeBusy(false); }
  };

  const clearKnowledge = async () => {
    if (!confirm('مسح فهرس Knowledge Base المحلي؟ الملفات الأصلية لن تُحذف.')) return;
    await window.abdx.knowledgeClear(); setKnowledgeResults([]); await refreshKnowledge();
  };

  const refreshMemory = async () => {
    try {
      const [st, list] = await Promise.all([window.abdx.memoryStatus?.(workspace || ''), window.abdx.memoryList?.({project:workspace || '',limit:100})]);
      if (st) setMemoryStatus(st); if (list) setMemoryItems(list.results || []);
      return {st,list};
    } catch { return null; }
  };
  const searchMemory = async (q=input) => {
    const query=String(q||'').trim(); if(!query||memoryBusy)return;
    setMemoryBusy(true); setRightTab('memory');
    try { const r=await window.abdx.memorySearch?.({query,project:workspace||'',limit:20}); setMemoryItems(r?.results||[]); }
    finally { setMemoryBusy(false); }
  };
  const rememberText = async (text=input) => {
    const content=String(text||'').trim(); if(!content||memoryBusy)return;
    setMemoryBusy(true); setRightTab('memory');
    try { await window.abdx.memoryAdd?.({content,kind:'note',scope:workspace?'project':'global',project:workspace||'',importance:70}); await refreshMemory(); }
    finally { setMemoryBusy(false); }
  };
  const deleteMemoryItem = async (id) => { if(!id)return; await window.abdx.memoryDelete?.(id); await refreshMemory(); };
  const clearProjectMemory = async () => { if(!workspace)return; if(!confirm('مسح ذاكرة هذا المشروع فقط؟'))return; await window.abdx.memoryClearProject?.(workspace); await refreshMemory(); };

  const refreshProject = async () => {
    if (!workspace) return;
    try {
      const [listed, info, st] = await Promise.all([window.abdx.listWorkspace(workspace), window.abdx.inspectProject(workspace), window.abdx.projectStatus(workspace)]);
      setFiles(listed || []); setProjectInfo(info || null); setProjectState(st || {running:false,logs:[],url:''});
      if (codeFile) { try { const text = await window.abdx.readWorkspaceFile(workspace, codeFile); setCodeValue(text); setCodeDirty(false); } catch {} }
    } catch {}
  };

  const saveCodeFile = async () => {
    if (!workspace || !codeFile || !codeDirty) return;
    setCodeBusy(true);
    try { await window.abdx.writeWorkspaceFile(workspace, codeFile, codeValue); setCodeDirty(false); setEvents(prev => [...prev.slice(-59), {label:'حفظ الملف',detail:codeFile,status:'done',type:'code'}]); }
    catch (e) { setSelectedFileText(`فشل الحفظ: ${e.message || e}`); }
    finally { setCodeBusy(false); }
  };
  const runProject = async () => { if (!workspace) return; setCodeBusy(true); setCodeBottomTab('terminal'); try { const st=await window.abdx.startProject({root:workspace}); setProjectState(st||{}); } catch(e){setSelectedFileText(`تعذر تشغيل المشروع: ${e.message||e}`);} finally{setCodeBusy(false);} };
  const stopProject = async () => { if (!workspace) return; const st=await window.abdx.stopProject(workspace); setProjectState(st||{}); };
  const runProjectChecks = async (includeTests=true) => { if(!workspace)return;setCodeBusy(true);try{const r=await window.abdx.projectCheck({root:workspace,includeTests});setProjectCheck(r);setSelectedFileText(JSON.stringify(r,null,2));}catch(e){setSelectedFileText(`فشل Project Check: ${e.message||e}`);}finally{setCodeBusy(false);} };
  const loadGit = async () => { if(!workspace)return;setCodeBusy(true);try{const [s,d,l]=await Promise.all([window.abdx.gitStatus(workspace),window.abdx.gitDiff(workspace),window.abdx.gitLog(workspace)]);setGitState({status:s.stdout||s.stderr||'',diff:d.stdout||d.stderr||'',log:l.stdout||l.stderr||''});setSelectedFileText(`GIT STATUS\n${s.stdout||s.stderr||''}\n\nGIT DIFF\n${d.stdout||d.stderr||''}\n\nGIT LOG\n${l.stdout||l.stderr||''}`);setRightTab('activity');}catch(e){setSelectedFileText(`Git غير متاح: ${e.message||e}`);}finally{setCodeBusy(false);} };
  const openPreview = async () => { if(!workspace)return;setCodeBottomTab('preview');try{const r=await window.abdx.browserOpenPreview({root:workspace,url:projectState.url||''});setPreviewInspect(r);}catch(e){setPreviewInspect({success:false,error:e.message||String(e)});} };
  const inspectPreview = async () => { try{const r=await window.abdx.browserInspect();setPreviewInspect(r);setSelectedFileText(JSON.stringify(r,null,2));}catch(e){setSelectedFileText(String(e));} };
  const openExternalPreview = async () => { if(projectState.url) await window.abdx.browserOpenExternal(projectState.url); };
  const screenshotPreview = async () => { try{const r=await window.abdx.browserScreenshot({root:workspace,filename:'.abdulkarem/preview.png'});setSelectedFileText(`Screenshot: ${r.path}`);}catch(e){setSelectedFileText(String(e));} };
  const autoRepair = () => send('نفّذ Autonomous Repair Loop كامل على المشروع الحالي. استخدم inspect_project ثم git_status/git_diff، افحص الملفات ذات الصلة، شغّل Build/Lint/Tests، أصلح السبب الجذري عبر edit_file، شغّل المشروع، افتح Browser Preview وافحص Console/Network/DOM، وكرر الإصلاح حتى verify_project. لا تعتبر المهمة مكتملة إلا بعد تحقق فعلي.');

  const send = async (override) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setEvents([]);
    setRightTab('activity');
    try {
      const res = await window.abdx.chat({
        mode,
        workspace,
        model: selectedModel,
        attachmentPaths: attachments,
        researchDepth: researchLevel,
        teamMode,
        messages: next.filter(m => m.role === 'user' || m.role === 'assistant')
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.content || 'ما رجع النموذج محتوى.' }]);
      if (res.model) setStatus(s => ({ ...s, activeModel: res.model }));
      if (res.routeReason) setRouteInfo({ kind: res.routeKind, reason: res.routeReason, model: res.model });
      setVerification(res.verification || null);
      setResearchSources(res.researchSources || []);
      setResearchMeta(res.researchMeta || null);
      setAgentRuns(res.agents || null);
      setLastIntelligence(res.intelligence || null);
      if (res.sandbox) {
        const wts=await window.abdx.worktreesStatus?.(); if(wts)setWorktreeInfo(wts);
        setRightTab('sandboxes');
      } else if (res.transaction && workspace) {
        const txs=await window.abdx.transactionsStatus?.(workspace); if(txs)setTransactionInfo(txs);
        setRightTab('transactions');
      } else if (res.intelligence) setRightTab('planner');
      window.abdx.intelligenceStatus?.().then(r=>r&&setIntelligenceInfo(r)).catch(()=>{});
      if (res.agents?.mode === 'team') setRightTab('agents');
      else if ((res.researchSources || []).length) setRightTab('sources');
      if (mode === 'code') await refreshProject();
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `صار خطأ بالتنفيذ: ${e.message || e}` }]);
    } finally { setBusy(false); }
  };

  const openWorkspaceFile = async (rel) => {
    if (!workspace) return;
    const text = await window.abdx.readWorkspaceFile(workspace, rel);
    if (mode === 'code') { setCodeFile(rel); setCodeValue(text); setCodeDirty(false); }
    setSelectedFileText(`// ${rel}

${text}`);
    if (mode !== 'code') setRightTab('files');
  };

  const exportConversation = async () => {
    const body = messages.map(m => `## ${m.role === 'user' ? 'المستخدم' : 'ABDULKAREM AI X'}\n\n${m.content}`).join('\n\n---\n\n');
    await window.abdx.saveMarkdown(body);
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value || '');
      setCopied(label); setTimeout(() => setCopied(''), 1400);
    } catch {}
  };

  const rotateApiKey = async () => {
    const next = await window.abdx.rotateApiKey();
    setApiInfo(prev => ({ ...prev, ...next, running:true, modelAlias:'abdulkarem-ai' }));
  };

  const browseResearchSource = async (source) => {
    if (!source?.url) return;
    setRightTab('activity');
    try {
      const page = await window.abdx.browseResearchUrl(source.url);
      setSelectedFileText(`${source.citation || 'SRC'} · ${page.title || source.title}\n${page.url}\n${page.published ? `Published: ${page.published}\n` : ''}\n${page.text || page.description || source.excerpt || ''}`);
    } catch (e) {
      setSelectedFileText(`تعذر قراءة المصدر: ${e.message || e}`);
    }
  };

  const refreshIntegrations = async (auth=true) => {
    setIntegrationBusy(true);
    try {
      const [st, aud, ap] = await Promise.all([window.abdx.integrationsStatus?.({auth}), window.abdx.integrationsAudit?.(80), window.abdx.integrationsApprovals?.()]);
      if (st) setIntegrationStatus(st);
      if (aud) setIntegrationAudit(aud.entries || []);
      if (ap) setIntegrationApprovals(ap.pending || []);
    } finally { setIntegrationBusy(false); }
  };

  const runIntegrationQuery = async (provider, action) => {
    setIntegrationBusy(true);
    setIntegrationResult(null);
    try {
      const r = await window.abdx.integrationsQuery?.({provider, action, workspace});
      setIntegrationResult(r || null);
      const aud = await window.abdx.integrationsAudit?.(80);
      if (aud) setIntegrationAudit(aud.entries || []);
      return r;
    } finally { setIntegrationBusy(false); }
  };

  const proposeIntegrationAction = async (provider, action, params={}) => {
    setIntegrationBusy(true); setIntegrationResult(null);
    try {
      const r=await window.abdx.integrationsPropose?.({provider,action,workspace,params});
      setIntegrationResult(r || null);
      const [ap,aud]=await Promise.all([window.abdx.integrationsApprovals?.(),window.abdx.integrationsAudit?.(80)]);
      if(ap)setIntegrationApprovals(ap.pending||[]); if(aud)setIntegrationAudit(aud.entries||[]);
      return r;
    } finally { setIntegrationBusy(false); }
  };
  const approveIntegrationAction = async (id) => {
    setIntegrationBusy(true);
    try {
      const r=await window.abdx.integrationsApprove?.(id); setIntegrationResult(r||null);
      const [ap,aud]=await Promise.all([window.abdx.integrationsApprovals?.(),window.abdx.integrationsAudit?.(80)]);
      if(ap)setIntegrationApprovals(ap.pending||[]); if(aud)setIntegrationAudit(aud.entries||[]); const wf=await window.abdx.workflowsList?.(); if(wf)setWorkflowState(wf); return r;
    } finally { setIntegrationBusy(false); }
  };
  const rejectIntegrationAction = async (id) => {
    setIntegrationBusy(true);
    try {
      const r=await window.abdx.integrationsReject?.(id); setIntegrationResult(r||null);
      const [ap,aud]=await Promise.all([window.abdx.integrationsApprovals?.(),window.abdx.integrationsAudit?.(80)]);
      if(ap)setIntegrationApprovals(ap.pending||[]); if(aud)setIntegrationAudit(aud.entries||[]); const wf=await window.abdx.workflowsList?.(); if(wf)setWorkflowState(wf); return r;
    } finally { setIntegrationBusy(false); }
  };

  const refreshWorkflows = async () => { const wf=await window.abdx.workflowsList?.(); if(wf)setWorkflowState(wf); return wf; };
  const createWorkflow = async (payload) => { setWorkflowBusy(true); try { const r=await window.abdx.workflowCreate?.(payload); await refreshWorkflows(); return r; } finally { setWorkflowBusy(false); } };
  const workflowAction = async (action,id) => { setWorkflowBusy(true); try { const fn={start:window.abdx.workflowStart,pause:window.abdx.workflowPause,resume:window.abdx.workflowResume,retry:window.abdx.workflowRetry,cancel:window.abdx.workflowCancel,delete:window.abdx.workflowDelete}[action]; const r=fn?await fn(id):null; await refreshWorkflows(); return r; } finally { setWorkflowBusy(false); } };
  const refreshAutomations = async () => { const a=await window.abdx.automationsList?.(); if(a)setAutomationState(a); return a; };
  const createAutomation = async (payload) => { setAutomationBusy(true); try { const r=await window.abdx.automationCreate?.(payload); await refreshAutomations(); return r; } finally { setAutomationBusy(false); } };
  const automationAction = async (action,id,value) => { setAutomationBusy(true); try { let r=null; if(action==='run')r=await window.abdx.automationRunNow?.(id); else if(action==='enable')r=await window.abdx.automationSetEnabled?.(id,Boolean(value)); else if(action==='delete')r=await window.abdx.automationDelete?.(id); await refreshAutomations(); return r; } finally { setAutomationBusy(false); } };

  const refreshRuntime = async () => { const [r,c]=await Promise.all([window.abdx.runtimeStatus?.(),window.abdx.recoveryStatus?.()]); if(r)setRuntimeInfo(r); if(c)setRecoveryInfo(c); return r; };
  const runtimeAction = async (action,value) => { setRuntimeBusy(true); try { let r=null; if(action==='startup')r=await window.abdx.runtimeSetStartup?.(Boolean(value)); else if(action==='pause')r=await window.abdx.runtimePauseScheduler?.(); else if(action==='resume')r=await window.abdx.runtimeResumeScheduler?.(); else if(action==='logs')r=await window.abdx.runtimeOpenLogs?.(); else if(action==='hide')r=await window.abdx.runtimeHide?.(); else if(action==='crashes')r=await window.abdx.recoveryOpenReports?.(); else if(action==='clear-session'){r=await window.abdx.recoverySessionClear?.();sessionRestoredRef.current=false;} await refreshRuntime(); return r; } finally { setRuntimeBusy(false); } };

  const saveSettings = async (patch) => {
    const next = await window.abdx.settingsSave?.(patch);
    if (next) { setAppSettings(next); if ('teamMode' in patch) setTeamMode(Boolean(next.teamMode)); if ('researchLevel' in patch) setResearchLevel(next.researchLevel || 'deep'); await refreshRuntime(); }
    return next;
  };

  const refreshModelManager = async () => { setModelBusy(true); try { const [m,p,plan,res]=await Promise.all([window.abdx.models(),window.abdx.modelProfile?.(),window.abdx.modelPlan?.(),window.abdx.resourceStatus?.()]); setModels(m||[]); if(p)setSystemProfile(p); if(plan)setModelPlan(plan); if(res)setResourceInfo(res); return plan; } finally { setModelBusy(false); } };
  const refreshResources = async () => { try { const r=await window.abdx.resourceStatus?.(); if(r)setResourceInfo(r); return r; } catch { return null; } };
  const refreshIntelligence = async () => { try { const [r,w,l]=await Promise.all([window.abdx.intelligenceStatus?.(),window.abdx.worktreesStatus?.(),window.abdx.lanesStatus?.()]); if(r)setIntelligenceInfo(r); if(w)setWorktreeInfo(w); if(l)setLaneInfo(l); return r; } catch { return null; } };
  const refreshEvaluations = async () => { try { const r=await window.abdx.evaluationsStatus?.(); if(r)setEvaluationInfo(r); return r; } catch { return null; } };
  const runEvaluation = async (liveModels=false) => { if(evaluationBusy)return; setEvaluationBusy(true); try { const r=await window.abdx.evaluationsRun?.({liveModels,modelNames:liveModels?[modelPlan?.routes?.general,modelPlan?.routes?.coding,modelPlan?.routes?.vision].filter(Boolean):[]}); const st=await window.abdx.evaluationsStatus?.(); if(st)setEvaluationInfo(st); if(r)setSelectedFileText(JSON.stringify(r,null,2)); return r; } catch(e){ alert(e.message||e); } finally { setEvaluationBusy(false); } };
  const promoteEvaluationBaseline = async () => { const id=evaluationInfo?.lastRun?.id; if(!id)return; if(!confirm('اعتماد آخر Evaluation كـ Regression Baseline؟'))return; try { await window.abdx.evaluationsPromoteBaseline?.(id); await refreshEvaluations(); } catch(e){ alert(e.message||e); } };
  const pullModel = async (name) => { const model=String(name||'').trim(); if(!model)return; setModelBusy(true); try { await window.abdx.modelPull(model); await refreshModelManager(); } catch(e){ alert(e.message||e); } finally { setModelBusy(false); } };
  const stopModel = async (name) => { if(!name)return; setModelBusy(true); try { await window.abdx.modelStop(name); await refreshModelManager(); } catch(e){ alert(e.message||e); } finally { setModelBusy(false); } };
  const runDiagnostics = async () => { setDiagnosticsBusy(true); try { const r=await window.abdx.diagnosticsRun(); setDiagnostics(r); setRightTab('activity'); return r; } finally { setDiagnosticsBusy(false); } };
  const exportDiagnostics = async () => { setDiagnosticsBusy(true); try { const r=await window.abdx.diagnosticsExport(); if(r?.report)setDiagnostics(r.report); } finally { setDiagnosticsBusy(false); } };
  const createBackup = async () => { setBackupBusy(true); try { const r=await window.abdx.backupCreate(); const b=await window.abdx.backupList(); setBackups(b||[]); setSelectedFileText(`Backup created: ${r.path}`); } finally { setBackupBusy(false); } };
  const restoreBackup = async (path='') => { if(!confirm('استعادة النسخة الاحتياطية ستستبدل إعدادات وبيانات ABDULKAREM AI X المحفوظة. تكمل؟')) return; setBackupBusy(true); try { const r=await window.abdx.backupRestore(path); if(r?.success) alert('تمت الاستعادة. أعد تشغيل التطبيق لتطبيق كل البيانات.'); } catch(e){ alert(e.message||e); } finally { setBackupBusy(false); } };

  const modeHint = useMemo(() => ({
    chat: 'اسأل، حلل، قارن، أو أعطني مهمة مباشرة…',
    research: 'اكتب موضوع البحث. النظام بيخطط عدة استعلامات، يفتح المصادر، يقارنها ويستشهد بها…',
    office: 'اسحب ملف Office أو اختر Workspace ثم اطلب إنشاء/تعديل Word أو Excel أو PowerPoint فعليًا…',
    knowledge: 'اسأل قاعدة المعرفة عن ملفاتك المفهرسة، أو أرفق ملفات واضغط فهرسة المرفقات…',
    memory: 'ابحث في الذاكرة طويلة المدى، أو اكتب معلومة مهمة واحفظها للمحادثات والمشاريع القادمة…',
    workflow: 'أنشئ Workflow متعدد المراحل مع Checkpoints واستئناف تلقائي بعد التوقف…',
    automation: 'جدول Workflow محليًا، راقب Queue وRun History وRetry…',
    code: 'اختر Workspace ثم قل: افحص المشروع، شغله، أصلح الخطأ…'
  }[mode]), [mode]);

  const activeInfo = activeAttachment ? fileInsights[activeAttachment] : null;

  return (
    <div className={`app-shell ${appSettings.compactSidebar ? 'compact-sidebar' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><BrainCircuit size={22}/></div>
          <div><div className="brand-title">ABDULKAREM AI X</div><div className="brand-sub">OMNI PRO · Transactional DAG Runtime v2.5</div></div>
        </div>
        <div className="top-actions">
          <button className={`team-toggle ${teamMode ? 'active' : ''}`} onClick={() => { const next=!teamMode; setTeamMode(next); saveSettings({teamMode:next}); }} title="تشغيل فريق وكلاء متعدد التخصصات"><BrainCircuit size={15}/>{teamMode ? 'TEAM AUTO · ON' : 'TEAM AUTO'}</button>
          <div className={`status-pill ${status.ollama ? 'ok' : 'bad'}`}><span className="dot" /> {status.ollama ? 'OLLAMA متصل' : 'OLLAMA غير متصل'}</div>
          <div className="model-select-wrap"><Sparkles size={15}/><select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}><option value="auto">SMART ROUTER · AUTO</option>{models.map(m => <option value={m.name} key={m.name}>{m.name}</option>)}</select><ChevronDown size={14}/></div>
          <button className={`api-pill ${apiInfo.running ? 'ok' : 'bad'}`} title="API المحلي" onClick={() => setApiOpen(true)}><KeyRound size={15}/><span>API</span></button>
          <button className="icon-btn" title="حفظ المحادثة" onClick={exportConversation}><Save size={17}/></button>
          <button className="icon-btn settings-trigger" title="الإعدادات والصحة والنسخ الاحتياطي" onClick={() => setSettingsOpen(true)}><Settings size={17}/></button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="section-label">مساحة العمل</div>
          <nav>{MODES.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setMode(item.id)} className={`nav-item ${mode === item.id ? 'active' : ''}`}><Icon size={18}/><span>{item.label}</span></button>; })}</nav>
          <div className="divider" />
          <button className="workspace-btn" onClick={chooseWorkspace}><FolderOpen size={17}/><span>{workspace ? 'تغيير المشروع' : 'فتح مشروع'}</span></button>
          {workspace && <div className="workspace-path" title={workspace}>{workspace}</div>}
          <div className="file-tree">{files.map(f => <button key={f.path} className="file-row" onClick={() => !f.directory && openWorkspaceFile(f.path)} disabled={f.directory}><span>{f.directory ? '▸' : '•'}</span>{f.path}</button>)}</div>
          <div className="sidebar-bottom"><div className="mini-card"><ShieldCheck size={16}/><div><b>Tool Safety</b><small>المسارات محصورة داخل الـWorkspace والملفات التي اخترتها.</small></div></div></div>
        </aside>

        <main className="chat-panel">
          <div className="context-strip">
            <div><WandSparkles size={16}/><b>{MODES.find(m => m.id === mode)?.label}</b>{mode === 'research' && <span className="research-level-badge">{researchLevel.toUpperCase()}</span>}</div>
            {status.activeModel && <span>النموذج: {status.activeModel}</span>}
            {routeInfo && <span className="route-badge">Router: {routeInfo.kind === 'coding' ? 'Coding' : 'General'} · {routeInfo.reason}</span>}
            {appSettings.showVerification && verification && <span className={`verify-badge ${verification.status}`}><CheckCircle2 size={13}/> Verification {verification.score}%</span>}
          </div>

          {mode === 'code' ? <CodeWorkbench
            workspace={workspace}
            codeFile={codeFile}
            codeValue={codeValue}
            onCodeChange={(value) => { setCodeValue(value ?? ''); setCodeDirty(true); }}
            codeDirty={codeDirty}
            onSave={saveCodeFile}
            projectInfo={projectInfo}
            projectState={projectState}
            projectCheck={projectCheck}
            gitState={gitState}
            bottomTab={codeBottomTab}
            setBottomTab={setCodeBottomTab}
            onRun={runProject}
            onStop={stopProject}
            onCheck={() => runProjectChecks(true)}
            onGit={loadGit}
            onPreview={openPreview}
            onInspectPreview={inspectPreview}
            onScreenshot={screenshotPreview}
            onExternal={openExternalPreview}
            previewInspect={previewInspect}
            lastAssistant={[...messages].reverse().find(m => m.role === 'assistant')?.content || ''}
            busy={codeBusy || busy}
          /> : mode === 'workflow' ? <WorkflowPanel state={workflowState} busy={workflowBusy} workspace={workspace} onCreate={createWorkflow} onAction={workflowAction} approvals={integrationApprovals} onApprove={approveIntegrationAction} onReject={rejectIntegrationAction}/> : mode === 'automation' ? <AutomationPanel state={automationState} workflowTemplates={workflowState?.templates||[]} busy={automationBusy} workspace={workspace} onCreate={createAutomation} onAction={automationAction}/> : <div className="messages" ref={scrollRef}>
            {messages.map((m, i) => <div key={i} className={`message-row ${m.role}`}><div className="avatar">{m.role === 'assistant' ? <Bot size={18}/> : 'أنت'}</div><div className="bubble"><FormattedText text={m.content}/></div></div>)}
            {busy && <div className="message-row assistant"><div className="avatar"><Bot size={18}/></div><div className="bubble thinking"><Loader2 className="spin" size={17}/> شغال على المهمة…</div></div>}
          </div>}

          {!['workflow','automation'].includes(mode) && <div className={`composer-wrap ${dropActive ? 'drop-active' : ''}`} onDragEnter={e => { e.preventDefault(); setDropActive(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropActive(false); }} onDrop={handleDrop}>
            {dropActive && <div className="drop-overlay"><Paperclip size={25}/><b>أفلت الملفات هنا</b><span>PDF · Word · Excel · PowerPoint · Images · ZIP · Code</span></div>}
            {!!attachments.length && <div className="attachment-toolbar"><div className="attachments">{attachments.map(p => <button className={`attachment-chip ${activeAttachment === p ? 'active' : ''}`} key={p} onClick={() => inspectAttachment(p)}><Paperclip size={13}/><span>{basename(p)}</span><small>{fileInsights[p]?.type || fileInsights[p]?.extension || '…'}</small><i onClick={e => { e.stopPropagation(); removeAttachment(p); }}>×</i></button>)}</div>{attachments.length >= 2 && <button className="compare-btn" onClick={compareAttached} disabled={compareBusy}>{compareBusy ? <Loader2 className="spin" size={14}/> : <GitCompare size={14}/>} مقارنة {Math.min(attachments.length,5)} ملفات</button>}</div>}
            <div className="composer"><button className="attach-btn" onClick={pickFiles} title="إرفاق ملفات"><Paperclip size={19}/></button><textarea value={input} onChange={e => setInput(e.target.value)} placeholder={modeHint} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }}}/><button className="send-btn" onClick={() => send()} disabled={busy || !input.trim()}>{busy ? <Loader2 className="spin" size={18}/> : <Send size={18}/>}</button></div>
            <div className="quick-actions">{attachments.length > 0 && <><button onClick={() => send('حلل الملفات المرفقة بالكامل، استخرج أهم المعلومات والمخاطر والتعارضات واربط كل نتيجة بالملف المناسب.') }><FileSearch size={13}/> تحليل شامل</button><button onClick={() => send('إذا كان أحد الملفات PDF ممسوحًا أو فيه صفحات لا يظهر نصها، استخدم OCR المرئي وحلل الصفحات المهمة.') }><ScanText size={13}/> OCR / Vision</button><button onClick={() => indexKnowledge(attachments)} disabled={knowledgeBusy}>{knowledgeBusy ? <Loader2 className="spin" size={13}/> : <Database size={13}/>} فهرسة المرفقات</button></>}{workspace && <button onClick={() => indexKnowledge([workspace])} disabled={knowledgeBusy}><HardDrive size={13}/> فهرسة Workspace</button>}{mode === 'research' && <><div className="research-level-select"><Gauge size={13}/><select value={researchLevel} onChange={e => { setResearchLevel(e.target.value); saveSettings({researchLevel:e.target.value}); }}><option value="quick">QUICK</option><option value="deep">DEEP</option><option value="expert">EXPERT</option><option value="max">MAX</option></select></div><button onClick={() => send()} disabled={busy || !input.trim()}><Globe2 size={13}/> ابدأ البحث {researchLevel.toUpperCase()}</button></>}{mode === 'knowledge' && <button onClick={() => directKnowledgeSearch()} disabled={knowledgeBusy || !input.trim()}><Search size={13}/> بحث مباشر</button>}{mode === 'memory' && <><button onClick={() => searchMemory()} disabled={memoryBusy || !input.trim()}><Search size={13}/> بحث في الذاكرة</button><button onClick={() => rememberText()} disabled={memoryBusy || !input.trim()}><BrainCircuit size={13}/> احفظ كذاكرة</button>{workspace&&<button onClick={clearProjectMemory}><Eraser size={13}/> مسح ذاكرة المشروع</button>}</>}{mode === 'office' && <><button onClick={() => send('أنشئ تقرير Word احترافي داخل الـWorkspace، عربي RTL، مع عنوان وأقسام منظمة وجداول عند الحاجة. استخدم create_word_document فعليًا ولا تكتفِ بكتابة المحتوى في المحادثة.')}><Files size={13}/> Word Pro</button><button onClick={() => send('أنشئ ملف Excel احترافي داخل الـWorkspace من البيانات المتاحة، مع صيغ وCharts وConditional Formatting وRTL عند الحاجة. استخدم create_excel_workbook فعليًا.')}><Database size={13}/> Excel Pro</button><button onClick={() => send('أنشئ عرض PowerPoint احترافي داخل الـWorkspace مع Storyline واضح وجداول أو صور عند الحاجة. استخدم create_powerpoint فعليًا.')}><MonitorPlay size={13}/> PowerPoint Pro</button></>}{mode === 'code' && workspace && <><button onClick={autoRepair} disabled={busy}><Bug size={13}/> AUTO REPAIR</button><button onClick={runProject} disabled={projectState.running || codeBusy}><PlayCircle size={13}/> تشغيل</button><button onClick={stopProject} disabled={!projectState.running}><CircleStop size={13}/> إيقاف</button><button onClick={() => runProjectChecks(true)} disabled={codeBusy}><TestTube2 size={13}/> Build/Test</button><button onClick={openPreview} disabled={!projectState.url}><Eye size={13}/> Preview</button><button onClick={loadGit}><GitBranch size={13}/> Git</button></>}</div>
            <div className="composer-foot">اسحب الملفات مباشرة أو استخدم زر الإرفاق · Enter للإرسال · Shift+Enter لسطر جديد</div>
          </div>}
        </main>

        <aside className="right-panel">
          <div className="right-tabs"><button className={rightTab === 'activity' ? 'active' : ''} onClick={() => setRightTab('activity')}>النشاط</button><button className={rightTab === 'agents' ? 'active' : ''} onClick={() => setRightTab('agents')}>Agents</button><button className={rightTab === 'planner' ? 'active' : ''} onClick={() => setRightTab('planner')}>Planner</button><button className={rightTab === 'evals' ? 'active' : ''} onClick={async()=>{setRightTab('evals');await refreshEvaluations();}}>Lab</button><button className={rightTab === 'transactions' ? 'active' : ''} onClick={async()=>{setRightTab('transactions');if(workspace){const r=await window.abdx.transactionsStatus?.(workspace);if(r)setTransactionInfo(r);}}}>Tx</button><button className={rightTab === 'sandboxes' ? 'active' : ''} onClick={async()=>{setRightTab('sandboxes');const r=await window.abdx.worktreesStatus?.();if(r)setWorktreeInfo(r);}}>Sandbox</button><button className={rightTab === 'lanes' ? 'active' : ''} onClick={async()=>{setRightTab('lanes');const r=await window.abdx.lanesStatus?.();if(r)setLaneInfo(r);}}>Lanes</button><button className={rightTab === 'files' ? 'active' : ''} onClick={() => setRightTab('files')}>Files</button><button className={rightTab === 'knowledge' ? 'active' : ''} onClick={() => setRightTab('knowledge')}>Knowledge</button><button className={rightTab === 'memory' ? 'active' : ''} onClick={() => setRightTab('memory')}>Memory</button><button className={rightTab === 'sources' ? 'active' : ''} onClick={() => setRightTab('sources')}>Sources</button></div>
          <div className={`right-content right-content-${rightTab}`}>
          {rightTab === 'activity' ? <div className="activity-stack">
            <div className="tool-events">{events.length === 0 ? <div className="empty-state"><SquareTerminal size={28}/><b>Agent Activity</b><p>بتظهر هنا قراءة الملفات، تشغيل الأوامر، OCR، Vision، والبحث.</p></div> : events.map((e, i) => <div className="event" key={i}><div className={`event-icon ${e.status || ''}`}>{e.status === 'running' ? <Loader2 className="spin" size={14}/> : <Play size={14}/>}</div><div><b>{e.label || e.type}</b>{e.detail && <small>{e.detail}</small>}</div></div>)}</div>
            <div className="preview-card"><div className="preview-title"><FileSearch size={16}/> معاينة / نتيجة</div><pre>{selectedFileText || 'اختر ملفًا من المشروع أو أرفق مستندًا لمعاينته هنا.'}</pre></div>
          </div> : rightTab === 'files' ? <div className="file-intelligence">
            {!activeInfo && !compareResult ? <div className="empty-state"><Info size={28}/><b>File Intelligence</b><p>أرفق ملفًا واضغط عليه لعرض النوع، الحجم، الصفحات، الجداول، الصور، الصيغ واحتياج OCR.</p></div> : <>
              {activeInfo && <FileInfoCard info={activeInfo}/>}
              {compareResult && <CompareCard result={compareResult}/>}
            </>}
          </div> : rightTab === 'agents' ? <AgentPanel status={agentsStatus} runs={agentRuns} teamMode={teamMode} onOpenMcp={async()=>{await window.abdx.mcpOpenConfig?.();const ag=await window.abdx.agentsStatus?.();if(ag)setAgentsStatus(ag);}} /> : rightTab === 'planner' ? <IntelligencePanel info={intelligenceInfo} current={lastIntelligence} dag={dagInfo} onCancel={async(id)=>{await window.abdx.dagCancel?.(id);const d=await window.abdx.dagStatus?.();if(d)setDagInfo(d);}}/> : rightTab === 'evals' ? <EvaluationPanel info={evaluationInfo} busy={evaluationBusy} onRefresh={refreshEvaluations} onRun={()=>runEvaluation(false)} onRunLive={()=>runEvaluation(true)} onBaseline={promoteEvaluationBaseline}/> : rightTab === 'transactions' ? <TransactionPanel info={transactionInfo} workspace={workspace} onRefresh={async()=>{if(workspace){const r=await window.abdx.transactionsStatus?.(workspace);if(r)setTransactionInfo(r);}}} onRollback={async(id)=>{if(!workspace||!id)return;const r=await window.abdx.transactionRollback?.({workspace,id});const txs=await window.abdx.transactionsStatus?.(workspace);if(txs)setTransactionInfo(txs);setSelectedFileText(JSON.stringify(r,null,2));}} onDiff={async(id)=>{if(!workspace||!id)return;const r=await window.abdx.transactionDiff?.({workspace,id});setSelectedFileText(JSON.stringify(r,null,2));}} onPreview={async(id,filePath)=>{if(!workspace||!id||!filePath)return;const r=await window.abdx.transactionPreviewFile?.({workspace,id,path:filePath});setSelectedFileText(`// Transaction Diff Preview: ${filePath}\n\n--- BEFORE ---\n${r?.before||''}\n\n--- AFTER ---\n${r?.after||''}`);setRightTab('activity');}}/> : rightTab === 'sandboxes' ? <WorktreePanel info={worktreeInfo} onRefresh={async()=>{const r=await window.abdx.worktreesStatus?.();if(r)setWorktreeInfo(r);}} onPreview={async(id)=>{const r=await window.abdx.worktreePreview?.(id);setSelectedFileText(`// Verified Worktree Patch: ${id}\n\n${r?.text||JSON.stringify(r,null,2)}`);setRightTab('activity');}}/> : rightTab === 'lanes' ? <LanePanel info={laneInfo} onRefresh={async()=>{const r=await window.abdx.lanesStatus?.();if(r)setLaneInfo(r);}} onPreview={async(id)=>{const r=await window.abdx.laneBundlePreview?.(id);setSelectedFileText(`// Parallel Lane Bundle: ${id}\n\n${r?.text||JSON.stringify(r,null,2)}`);setRightTab('activity');}}/> : rightTab === 'knowledge' ? <KnowledgePanel knowledge={knowledge} results={knowledgeResults} busy={knowledgeBusy} onClear={clearKnowledge} /> : rightTab === 'memory' ? <MemoryPanel status={memoryStatus} items={memoryItems} busy={memoryBusy} workspace={workspace} onRefresh={refreshMemory} onDelete={deleteMemoryItem} /> : <ResearchPanel status={researchStatus} sources={researchSources} meta={researchMeta} onBrowse={browseResearchSource} />}
          </div>
          <div className="capability-grid"><div className={knowledge.documents > 0 ? 'ready' : ''}><Database/><span>RAG {knowledge.documents || 0}</span></div><div><FileSearch/><span>Files</span></div><div className={models.some(m => m.name?.toLowerCase().includes('gemma4:26b')) ? 'ready' : ''}><ImageIcon/><span>gemma4 Vision</span></div><div><SquareTerminal/><span>Tools</span></div><div className="ready"><MonitorPlay/><span>Office Pro</span></div><div className={(researchStatus?.providers?.duckduckgo?.configured || researchStatus?.providers?.searxng?.reachable || researchStatus?.providers?.brave?.configured) ? 'ready' : ''}><Globe2/><span>Research</span></div><div className={projectInfo ? 'ready' : ''}><Code2/><span>Coding</span></div><div className={agentsStatus?.agents?.length ? 'ready' : ''}><BrainCircuit/><span>Agents {agentsStatus?.agents?.length || 0}</span></div><div className={agentsStatus?.skills?.length ? 'ready' : ''}><Sparkles/><span>Skills {agentsStatus?.skills?.length || 0}</span></div><div className={(integrationStatus?.providers||[]).some(p=>p.installed) ? 'ready' : ''}><GitBranch/><span>Integrations {(integrationStatus?.providers||[]).filter(p=>p.installed).length}</span></div><div className={agentsStatus?.mcp?.enabled ? 'ready' : ''}><Braces/><span>MCP {agentsStatus?.mcp?.enabled || 0}</span></div><div className={(workflowState?.workflows||[]).length ? 'ready' : ''}><ListChecks/><span>Flows {(workflowState?.workflows||[]).length}</span></div><div className={(automationState?.automations||[]).length ? 'ready' : ''}><Activity/><span>Autos {(automationState?.automations||[]).length}</span></div><div className={runtimeInfo?.trayActive&&runtimeInfo?.schedulerRunning?'ready':''}><MonitorPlay/><span>Runtime {runtimeInfo?.schedulerRunning?'ON':'PAUSED'}</span></div><div className={!recoveryInfo?.safeMode?'ready':''}><ShieldCheck/><span>Recovery {recoveryInfo?.safeMode?'SAFE':'READY'}</span></div><div className={resourceInfo?.enabled?'ready':''}><Gauge/><span>Governor {resourceInfo?.queue?.pending||0}</span></div><div className={intelligenceInfo?.enabled?'ready':''}><BrainCircuit/><span>Core {intelligenceInfo?.version||'2.0'}</span></div><div className={appSettings.transactionalWorkspaceEnabled!==false?'ready':''}><Archive/><span>Tx Rollback</span></div><div className={appSettings.worktreeSandboxEnabled!==false?'ready':''}><GitBranch/><span>Worktree Sandbox</span></div><div className={appSettings.parallelCodingLanesEnabled!==false?'ready':''}><GitCompare/><span>Parallel Lanes</span></div><div className={evaluationInfo?.lastRun?.releaseGate?.status==='PASS'?'ready':''}><TestTube2/><span>Gate {evaluationInfo?.lastRun?.releaseGate?.status||'—'}</span></div></div>
        </aside>
      </div>

      {settingsOpen && <SettingsCenter
        settings={appSettings}
        onSave={saveSettings}
        diagnostics={diagnostics}
        diagnosticsBusy={diagnosticsBusy}
        onDiagnostics={runDiagnostics}
        onExportDiagnostics={exportDiagnostics}
        backups={backups}
        backupBusy={backupBusy}
        onBackup={createBackup}
        onRestore={restoreBackup}
        onOpenBackupFolder={() => window.abdx.backupOpenFolder?.()}
        updateInfo={updateInfo}
        models={models}
        systemProfile={systemProfile}
        modelPlan={modelPlan}
        resourceInfo={resourceInfo}
        onRefreshResources={refreshResources}
        intelligenceInfo={intelligenceInfo}
        worktreeInfo={worktreeInfo}
        onRefreshIntelligence={refreshIntelligence}
        evaluationInfo={evaluationInfo}
        evaluationBusy={evaluationBusy}
        onRefreshEvaluations={refreshEvaluations}
        onRunEvaluation={runEvaluation}
        onPromoteEvaluationBaseline={promoteEvaluationBaseline}
        modelBusy={modelBusy}
        onRefreshModels={refreshModelManager}
        onPullModel={pullModel}
        onStopModel={stopModel}
        integrationStatus={integrationStatus}
        integrationAudit={integrationAudit}
        integrationApprovals={integrationApprovals}
        integrationBusy={integrationBusy}
        integrationResult={integrationResult}
        onRefreshIntegrations={refreshIntegrations}
        onIntegrationQuery={runIntegrationQuery}
        onIntegrationPropose={proposeIntegrationAction}
        onIntegrationApprove={approveIntegrationAction}
        onIntegrationReject={rejectIntegrationAction}
        workspace={workspace}
        runtimeInfo={runtimeInfo}
        runtimeBusy={runtimeBusy}
        recoveryInfo={recoveryInfo}
        onRuntimeRefresh={refreshRuntime}
        onRuntimeAction={runtimeAction}
        onClose={() => setSettingsOpen(false)}
      />}
      {apiOpen && <div className="modal-backdrop" onMouseDown={() => setApiOpen(false)}><div className="api-modal" onMouseDown={e => e.stopPropagation()}><div className="api-modal-head"><div><KeyRound size={18}/><b>ABDULKAREM AI X API</b></div><button onClick={() => setApiOpen(false)}><X size={18}/></button></div><div className="api-health"><span className={`dot ${apiInfo.running ? 'ok' : ''}`}></span><b>{apiInfo.running ? 'API شغال محليًا' : 'API غير متاح'}</b><small>يستمع على 127.0.0.1 فقط افتراضيًا</small></div><label>Base URL</label><div className="copy-row"><code>{apiInfo.baseUrl || 'http://127.0.0.1:8787/v1'}</code><button onClick={() => copyText(apiInfo.baseUrl, 'url')}><Copy size={15}/>{copied === 'url' ? 'تم' : 'نسخ'}</button></div><label>Model Alias</label><div className="copy-row"><code>{apiInfo.modelAlias || 'abdulkarem-ai'}</code><button onClick={() => copyText(apiInfo.modelAlias || 'abdulkarem-ai', 'model')}><Copy size={15}/>{copied === 'model' ? 'تم' : 'نسخ'}</button></div><label>API Key</label><div className="copy-row key"><code>{apiInfo.apiKey || '—'}</code><button onClick={() => copyText(apiInfo.apiKey, 'key')}><Copy size={15}/>{copied === 'key' ? 'تم' : 'نسخ'}</button></div><div className="api-actions"><button className="rotate-key" onClick={rotateApiKey}><RefreshCw size={15}/> تغيير المفتاح</button></div><div className="api-example"><b>OpenAI-compatible</b><pre>{`POST ${apiInfo.baseUrl || 'http://127.0.0.1:8787/v1'}/chat/completions\nAuthorization: Bearer ${apiInfo.apiKey || 'akx_...'}\n\n{\n  "model": "abdulkarem-ai",\n  "messages": [{"role":"user","content":"حلل الملف"}]\n}`}</pre></div></div></div>}
    </div>
  );
}



function AutomationPanel({ state, workflowTemplates, busy, workspace, onCreate, onAction }) {
  const automations=state?.automations || [];
  const runs=state?.runs || [];
  const templates=workflowTemplates || [];
  const [template,setTemplate]=useState('quality_gate');
  const [name,setName]=useState('');
  const [goal,setGoal]=useState('');
  const [scheduleType,setScheduleType]=useState('manual');
  const [intervalMinutes,setIntervalMinutes]=useState(60);
  const [dailyTime,setDailyTime]=useState('08:00');
  const [onceAt,setOnceAt]=useState('');
  const [maxAttempts,setMaxAttempts]=useState(1);
  const [backoffMinutes,setBackoffMinutes]=useState(5);
  const [selectedId,setSelectedId]=useState('');
  useEffect(()=>{ if(!selectedId&&automations[0]?.id)setSelectedId(automations[0].id); if(selectedId&&!automations.some(a=>a.id===selectedId))setSelectedId(automations[0]?.id||''); },[automations,selectedId]);
  const selected=automations.find(a=>a.id===selectedId) || automations[0] || null;
  const selectedTemplate=templates.find(t=>t.key===template);
  const selectedRuns=runs.filter(r=>r.automationId===selected?.id).slice(0,60);
  const schedulePayload=()=> scheduleType==='once'?{type:'once',onceAt:new Date(onceAt).toISOString()}:scheduleType==='interval'?{type:'interval',intervalMinutes:Number(intervalMinutes||60)}:scheduleType==='daily'?{type:'daily',dailyTime}:{type:'manual'};
  const create=async()=>{
    if(scheduleType==='once'&&!onceAt){alert('حدد وقت التشغيل مرة واحدة.');return;}
    let schedule; try{schedule=schedulePayload();}catch{alert('وقت التشغيل غير صالح.');return;}
    const r=await onCreate?.({template,name:name.trim(),goal:goal.trim(),workspace,schedule,retry:{maxAttempts:Number(maxAttempts||1),backoffMinutes:Number(backoffMinutes||5)},enabled:true});
    if(r?.success){setSelectedId(r.automation?.id||'');setName('');setGoal('');}
    else if(r?.error)alert(r.error);
  };
  const act=async(action,id,value)=>{const r=await onAction?.(action,id,value);if(r?.error)alert(r.error);return r;};
  const fmt=(v)=>v?new Date(v).toLocaleString():'—';
  const sched=(a)=>a?.schedule?.type==='interval'?`كل ${a.schedule.intervalMinutes} دقيقة`:a?.schedule?.type==='daily'?`يوميًا ${a.schedule.dailyTime}`:a?.schedule?.type==='once'?`مرة واحدة · ${fmt(a.schedule.onceAt)}`:'يدوي';
  return <div className="automation-workbench">
    <div className="automation-stats">
      <div><Activity size={17}/><span><b>{state?.running||0}</b><small>RUNNING</small></span></div>
      <div><ListChecks size={17}/><span><b>{state?.queued||0}</b><small>QUEUED</small></span></div>
      <div><ShieldAlert size={17}/><span><b>{state?.waitingApproval||0}</b><small>WAITING APPROVAL</small></span></div>
      <div><CheckCircle2 size={17}/><span><b>{state?.enabled||0}/{state?.total||0}</b><small>ENABLED</small></span></div>
    </div>
    <div className="automation-create-card">
      <div className="workflow-create-head"><div><Activity size={19}/><div><b>Automation & Background Tasks</b><small>Persistent Scheduler · Queue · Retry · Workflow Runner · Approval Safe</small></div></div><span>v2.5</span></div>
      <div className="automation-form">
        <label>Workflow Template<select value={template} onChange={e=>setTemplate(e.target.value)}>{templates.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
        <label>اسم الأتمتة<input value={name} onChange={e=>setName(e.target.value)} placeholder={selectedTemplate?.label||'Automation name'}/></label>
        <label>Schedule<select value={scheduleType} onChange={e=>setScheduleType(e.target.value)}><option value="manual">Manual only</option><option value="interval">Interval</option><option value="daily">Daily</option><option value="once">Run once</option></select></label>
        {scheduleType==='interval'&&<label>كل كم دقيقة<input type="number" min="5" max="10080" value={intervalMinutes} onChange={e=>setIntervalMinutes(e.target.value)}/></label>}
        {scheduleType==='daily'&&<label>الوقت اليومي<input type="time" value={dailyTime} onChange={e=>setDailyTime(e.target.value)}/></label>}
        {scheduleType==='once'&&<label>وقت التشغيل<input type="datetime-local" value={onceAt} onChange={e=>setOnceAt(e.target.value)}/></label>}
        <label>Max attempts<select value={maxAttempts} onChange={e=>setMaxAttempts(e.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <label>Retry بعد (دقيقة)<input type="number" min="1" max="120" value={backoffMinutes} onChange={e=>setBackoffMinutes(e.target.value)}/></label>
        <label className="automation-goal">الهدف<textarea value={goal} onChange={e=>setGoal(e.target.value)} placeholder="المهمة التي سينفذها الـWorkflow عند كل تشغيل…"/></label>
        <button className="primary automation-create-btn" onClick={create} disabled={busy||(selectedTemplate?.requiresWorkspace&&!workspace)}><Activity size={14}/> إنشاء Automation</button>
      </div>
      <div className="workflow-template-note"><ShieldCheck size={14}/><span>مع Background Runtime تواصل الأتمتة العمل بعد إغلاق النافذة إلى System Tray. إذا خرجت من التطبيق بالكامل، يتم Catch-up لمرة واحدة عند التشغيل التالي. Cloud mutation يظل متوقفًا عند Approval Gate.</span></div>
    </div>
    <div className="automation-main-grid">
      <div className="automation-list-card">
        <div className="workflow-section-head"><b>Automations</b><span>{automations.length}</span></div>
        <div className="automation-list">{automations.map(a=><button key={a.id} className={`automation-list-row ${selected?.id===a.id?'active':''}`} onClick={()=>setSelectedId(a.id)}><div><b>{a.name}</b><small>{sched(a)}</small></div><span className={`auto-state ${a.state}`}>{a.state}</span></button>)}{!automations.length&&<div className="empty-state"><Activity size={28}/><b>ما فيه Automations</b><p>أنشئ مهمة يدوية أو مجدولة من الأعلى.</p></div>}</div>
      </div>
      <div className="automation-detail-card">{selected? <>
        <div className="automation-detail-head"><div><b>{selected.name}</b><small>{selected.template} · {selected.workspace||'بدون Workspace'}</small></div><span className={`auto-state big ${selected.state}`}>{selected.state}</span></div>
        <div className="automation-meta-grid"><div><small>Schedule</small><b>{sched(selected)}</b></div><div><small>Next run</small><b>{fmt(selected.nextRunAt)}</b></div><div><small>Last status</small><b>{selected.lastRunStatus||'—'}</b></div><div><small>Runs</small><b>{selected.runCount||0}</b></div><div><small>Retry</small><b>{selected.retry?.maxAttempts||1} attempts · {selected.retry?.backoffMinutes||5}m</b></div><div><small>Queue concurrency</small><b>{state?.concurrency||1}</b></div></div>
        {selected.goal&&<div className="workflow-goal-view"><b>Goal</b><p>{selected.goal}</p></div>}
        <div className="workflow-controls"><button className="primary" onClick={()=>act('run',selected.id)} disabled={busy}><PlayCircle size={14}/> Run now</button>{selected.state==='enabled'?<button onClick={()=>act('enable',selected.id,false)} disabled={busy}><PauseCircle size={14}/> Pause schedule</button>:<button onClick={()=>act('enable',selected.id,true)} disabled={busy}><PlayCircle size={14}/> Enable schedule</button>}<button onClick={()=>{if(confirm('حذف تعريف الأتمتة؟ سجل الـWorkflow والملفات لن تُحذف.'))act('delete',selected.id);}} disabled={busy}><Trash2 size={14}/> Delete</button></div>
        <div className="automation-history"><div className="workflow-section-head"><b>Execution History</b><span>{selectedRuns.length}</span></div>{selectedRuns.map(r=><div className={`automation-run ${r.status}`} key={r.id}><div><span className={`run-dot ${r.status}`}></span><b>{r.status}</b><small>{r.trigger} · attempt {r.attempt||1}</small></div><div><small>{fmt(r.createdAt)}</small>{r.workflowId&&<code>{r.workflowId}</code>}</div>{r.error&&<p>{r.error}</p>}</div>)}{!selectedRuns.length&&<div className="empty-state compact"><Activity size={24}/><b>لا يوجد Run History</b><p>اضغط Run now أو انتظر الجدولة.</p></div>}</div>
      </> : <div className="empty-state"><Activity size={34}/><b>اختر Automation</b><p>التفاصيل وسجل التنفيذ يظهران هنا.</p></div>}</div>
    </div>
  </div>;
}


function WorkflowPanel({ state, busy, workspace, onCreate, onAction, approvals, onApprove, onReject }) {
  const templates=state?.templates || [];
  const workflows=state?.workflows || [];
  const [template,setTemplate]=useState('coding_repair');
  const [name,setName]=useState('');
  const [goal,setGoal]=useState('');
  const [selectedId,setSelectedId]=useState('');
  useEffect(()=>{ if(!selectedId && workflows[0]?.id)setSelectedId(workflows[0].id); if(selectedId && !workflows.some(w=>w.id===selectedId))setSelectedId(workflows[0]?.id||''); },[workflows,selectedId]);
  const selected=workflows.find(w=>w.id===selectedId) || workflows[0] || null;
  const selectedTemplate=templates.find(t=>t.key===template);
  const create=async()=>{
    const r=await onCreate?.({template,name:name.trim(),goal:goal.trim(),workspace});
    if(r?.success){setSelectedId(r.workflow?.id||'');setName('');setGoal('');}
    else if(r?.error)alert(r.error);
  };
  const runAction=async(action,id)=>{const r=await onAction?.(action,id);if(r?.error)alert(r.error);return r;};
  const progress=selected?.steps?.length ? Math.round((selected.steps.filter(s=>s.status==='completed'||s.status==='skipped').length/selected.steps.length)*100) : 0;
  const statusLabel={ready:'READY',running:'RUNNING',waiting_approval:'WAITING APPROVAL',paused:'PAUSED',completed:'COMPLETED',failed:'FAILED',cancelled:'CANCELLED'}[selected?.status]||String(selected?.status||'').toUpperCase();
  return <div className="workflow-workbench">
    <div className="workflow-create-card">
      <div className="workflow-create-head"><div><ListChecks size={19}/><div><b>Workflow Engine</b><small>مراحل محفوظة + Checkpoints + Resume + Approval Gate</small></div></div><span>v1.5</span></div>
      <div className="workflow-form">
        <label>Template<select value={template} onChange={e=>setTemplate(e.target.value)}>{templates.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
        <label>اسم المهمة<input value={name} onChange={e=>setName(e.target.value)} placeholder={selectedTemplate?.label||'Workflow name'}/></label>
        <label className="workflow-goal">الهدف<textarea value={goal} onChange={e=>setGoal(e.target.value)} placeholder="مثال: أصلح المشروع، شغّل الاختبارات، ثم جهز Preview Deploy للمراجعة…"/></label>
        <button className="primary workflow-create-btn" onClick={create} disabled={busy || (selectedTemplate?.requiresWorkspace && !workspace)}><ListChecks size={14}/> إنشاء Workflow</button>
      </div>
      <div className="workflow-template-note"><ShieldCheck size={14}/><span>{selectedTemplate?.description||'اختر Template.'}{selectedTemplate?.requiresWorkspace&&!workspace?' · افتح Workspace أول.':''}</span></div>
    </div>

    <div className="workflow-main-grid">
      <div className="workflow-list-card">
        <div className="workflow-section-head"><b>Workflows</b><span>{workflows.length}</span></div>
        <div className="workflow-list">{workflows.map(w=><button key={w.id} className={`workflow-list-row ${selected?.id===w.id?'active':''}`} onClick={()=>setSelectedId(w.id)}><div><b>{w.name}</b><small>{w.template} · {w.steps?.length||0} steps</small></div><span className={`wf-status ${w.status}`}>{w.status}</span></button>)}{!workflows.length&&<div className="empty-state"><ListChecks size={28}/><b>ما فيه Workflow حتى الآن</b><p>أنشئ واحد من القوالب فوق.</p></div>}</div>
      </div>

      <div className="workflow-detail-card">{selected ? <>
        <div className="workflow-detail-head"><div><b>{selected.name}</b><small>{selected.workspace||'بدون Workspace'}</small></div><span className={`wf-status big ${selected.status}`}>{statusLabel}</span></div>
        <div className="workflow-progress"><div><span style={{width:`${progress}%`}}/></div><small>{progress}% · Step {Math.min((selected.cursor||0)+1,selected.steps?.length||0)} / {selected.steps?.length||0} · Checkpoints {selected.checkpoints?.length||0}</small></div>
        {selected.goal&&<div className="workflow-goal-view"><b>Goal</b><p>{selected.goal}</p></div>}
        <div className="workflow-controls">
          {selected.status==='ready'&&<button className="primary" onClick={()=>runAction('start',selected.id)} disabled={busy}><PlayCircle size={14}/> Start</button>}
          {selected.status==='running'&&<button onClick={()=>runAction('pause',selected.id)} disabled={busy}><PauseCircle size={14}/> Pause</button>}
          {selected.status==='paused'&&<button className="primary" onClick={()=>runAction('resume',selected.id)} disabled={busy}><PlayCircle size={14}/> Resume</button>}
          {selected.status==='failed'&&<button className="primary" onClick={()=>runAction('retry',selected.id)} disabled={busy}><RotateCw size={14}/> Retry failed step</button>}
          {selected.status==='waiting_approval'&&!((approvals||[]).some(a=>a.id===selected.steps?.[selected.cursor]?.approvalId))&&<button className="primary" onClick={()=>runAction('retry',selected.id)} disabled={busy}><RotateCw size={14}/> تجديد Preview</button>}
          {!['completed','cancelled'].includes(selected.status)&&<button className="danger-soft" onClick={()=>runAction('cancel',selected.id)} disabled={busy}><CircleStop size={14}/> Cancel</button>}
          {!['running','waiting_approval'].includes(selected.status)&&<button onClick={()=>{if(confirm('حذف سجل Workflow؟ لن يتم حذف ملفات المشروع.'))runAction('delete',selected.id);}} disabled={busy}><Trash2 size={14}/> Delete record</button>}
        </div>
        {selected.error&&<div className="workflow-error"><ShieldAlert size={15}/><span>{selected.error}</span></div>}
        {selected.pauseReason&&<div className="workflow-pause"><Info size={15}/><span>{selected.pauseReason}</span></div>}
        <div className="workflow-steps">{(selected.steps||[]).map((step,i)=>{
          const approval=(approvals||[]).find(a=>a.id===step.approvalId);
          return <div className={`workflow-step ${step.status}`} key={step.id}><div className="workflow-step-index">{step.status==='completed'?<CheckCircle2 size={16}/>:step.status==='running'?<Loader2 className="spin" size={16}/>:step.status==='waiting_approval'?<ShieldAlert size={16}/>:step.status==='failed'?<X size={16}/>:i+1}</div><div className="workflow-step-body"><div><b>{step.label}</b><span>{step.type}</span></div><small>{step.status.toUpperCase()} · attempts {step.attempts||0}{step.finishedAt?` · ${new Date(step.finishedAt).toLocaleTimeString()}`:''}</small>{step.error&&<p className="bad-text">{step.error}</p>}{step.status==='waiting_approval'&&<div className="workflow-approval-inline"><small>هذه المرحلة لن تنفذ حتى توافق عليها أنت.</small>{approval?<div><button onClick={()=>onReject?.(approval.id)} disabled={busy}><X size={13}/> رفض</button><button className="approve" onClick={()=>onApprove?.(approval.id)} disabled={busy}><ShieldCheck size={13}/> مراجعة وموافقة</button></div>:<span className="warn-text">Approval ticket غير موجود؛ بعد إعادة تشغيل التطبيق استخدم Resume لإنشاء Preview جديد.</span>}</div>}{step.output&&<details><summary>Step output</summary><pre>{JSON.stringify(step.output,null,2)}</pre></details>}</div></div>;
        })}</div>
        <div className="workflow-checkpoints"><b>آخر Checkpoints</b>{(selected.checkpoints||[]).slice(-5).reverse().map(cp=><div key={cp.id}><CheckCheck size={13}/><span>{cp.stepLabel}</span><small>{new Date(cp.at).toLocaleString()}</small></div>)}{!(selected.checkpoints||[]).length&&<small>يتولد Checkpoint تلقائي بعد كل مرحلة ناجحة.</small>}</div>
      </> : <div className="empty-state"><ListChecks size={34}/><b>اختر Workflow</b><p>التفاصيل والمراحل تظهر هنا.</p></div>}</div>
    </div>
  </div>;
}

function AgentPanel({ status, runs, teamMode, onOpenMcp }) {
  const agents=status?.agents || [];
  const skills=status?.skills || [];
  const mcp=status?.mcp || {configured:0,enabled:0,connected:[],servers:[]};
  return <div className="agent-panel-v09">
    <div className="agent-summary"><BrainCircuit size={18}/><div><b>{teamMode ? 'TEAM AUTO مفعّل' : 'Single Agent + Tool Router'}</b><small>{agents.length} Agents · {skills.length} Skills · {mcp.enabled || 0} MCP enabled</small></div></div>
    {runs?.plan?.length ? <div className="agent-run-plan"><b>آخر خطة</b><div>{runs.plan.map((id,i)=><span key={id}>{i+1}. {id}</span>)}</div>{(runs.runs||[]).map((r,i)=><div className="agent-run-row" key={`${r.agent}-${i}`}><span>{r.label || r.agent}</span><small>{r.model || ''}</small><b>{r.verification?.score ?? '—'}%</b></div>)}</div> : null}
    <div className="agent-list"><b>الوكلاء</b>{agents.map(a=><div className="agent-card-mini" key={a.id}><div><span className="agent-dot"></span><b>{a.label}</b></div><small>{a.modelKind} · {(a.groups||[]).join(' / ')}</small></div>)}</div>
    <div className="skill-list"><b>Skills المحملة</b><div>{skills.slice(0,10).map(s=><span key={s.name} title={s.description}>{s.name}</span>)}</div></div>
    <div className="mcp-box"><div className="mcp-head"><b>MCP</b><button onClick={onOpenMcp}>فتح الإعداد</button></div><small>{mcp.configured || 0} configured · {mcp.enabled || 0} enabled · {(mcp.connected || []).length} connected</small>{(mcp.servers||[]).map(s=><div key={s.name}><span>{s.connected ? '●' : '○'} {s.name}</span><small>{s.command}</small></div>)}</div>
  </div>;
}

function CodeWorkbench({ workspace, codeFile, codeValue, onCodeChange, codeDirty, onSave, projectInfo, projectState, projectCheck, gitState, bottomTab, setBottomTab, onRun, onStop, onCheck, onGit, onPreview, onInspectPreview, onScreenshot, onExternal, previewInspect, lastAssistant, busy }) {
  const runnerText=(projectState?.logs||[]).map(x=>`[${x.stream||'log'}] ${x.line||''}`).join('\n');
  const checkPassed=projectCheck?.results?.length ? projectCheck.results.every(x=>x.success) : null;
  return <div className="code-workbench">
    <div className="code-toolbar">
      <div className="code-project-meta"><Braces size={15}/><div><b>{projectInfo?.package?.name || basename(workspace) || 'Coding Workspace'}</b><small>{projectInfo?.kind || '—'}{projectInfo?.framework?.length ? ` · ${projectInfo.framework.join(' / ')}` : ''}</small></div></div>
      <div className="code-toolbar-actions">
        <button onClick={onSave} disabled={!codeDirty || busy} title="حفظ"><Save size={14}/>{codeDirty ? 'حفظ *' : 'محفوظ'}</button>
        <button onClick={onGit} disabled={!workspace}><GitBranch size={14}/> Git</button>
        <button onClick={onCheck} disabled={!workspace || busy} className={checkPassed===true?'pass':checkPassed===false?'fail':''}><TestTube2 size={14}/> Build/Test</button>
        {!projectState?.running ? <button onClick={onRun} disabled={!workspace || busy} className="run"><PlayCircle size={14}/> Run</button> : <button onClick={onStop} className="stop"><CircleStop size={14}/> Stop</button>}
        <button onClick={onPreview} disabled={!projectState?.url}><Eye size={14}/> Preview</button>
      </div>
    </div>
    <div className="code-editor-shell">
      <div className="editor-title"><FileCode2 size={14}/><span>{codeFile || 'اختر ملفًا من الشريط الجانبي'}</span>{codeDirty && <i>●</i>}</div>
      {workspace && codeFile ? <React.Suspense fallback={<div className="code-empty"><Loader2 className="spin" size={28}/><b>جاري تحميل Monaco Editor…</b></div>}><Editor
        height="100%"
        path={codeFile}
        language={monacoLanguage(codeFile)}
        value={codeValue}
        onChange={onCodeChange}
        theme="vs-dark"
        options={{fontSize:13,fontFamily:'Cascadia Code, Consolas, monospace',minimap:{enabled:true},automaticLayout:true,wordWrap:'off',scrollBeyondLastLine:false,smoothScrolling:true,renderWhitespace:'selection',padding:{top:10},tabSize:2}}
      /></React.Suspense> : <div className="code-empty"><Code2 size={38}/><b>{workspace ? 'اختر ملفًا للبدء' : 'افتح مشروع أول'}</b><p>{workspace ? 'اختر أي ملف من File Explorer على اليسار، أو اطلب من الـAgent يفحص المشروع تلقائيًا.' : 'Coding Agent يحتاج Workspace حقيقي حتى يقرأ ويعدل ويشغل المشروع.'}</p></div>}
    </div>
    <div className="code-bottom-pane">
      <div className="code-bottom-tabs">
        <button className={bottomTab==='terminal'?'active':''} onClick={()=>setBottomTab('terminal')}><SquareTerminal size={13}/> Terminal</button>
        <button className={bottomTab==='runner'?'active':''} onClick={()=>setBottomTab('runner')}><Play size={13}/> Runner {projectState?.running&&<span className="live-dot"/>}</button>
        <button className={bottomTab==='preview'?'active':''} onClick={()=>setBottomTab('preview')}><MonitorPlay size={13}/> Preview</button>
        <button className={bottomTab==='agent'?'active':''} onClick={()=>setBottomTab('agent')}><Bot size={13}/> Agent</button>
        <button className={bottomTab==='git'?'active':''} onClick={()=>{setBottomTab('git');onGit?.();}}><GitBranch size={13}/> Git</button>
        <div className="code-bottom-status">{projectState?.url ? <span className="url-live">{projectState.url}</span> : projectState?.running ? 'يبحث عن Preview URL…' : 'Project stopped'}</div>
      </div>
      <div className="code-bottom-content">
        <div style={{display:bottomTab==='terminal'?'block':'none',height:'100%'}}><TerminalPane workspace={workspace}/></div>
        {bottomTab==='runner' && <pre className="runner-log">{runnerText || 'شغّل المشروع لعرض stdout/stderr هنا.'}</pre>}
        {bottomTab==='preview' && <div className="preview-workspace">
          <div className="preview-toolbar"><span>{projectState?.url || 'لا يوجد URL'}</span><button onClick={onPreview} disabled={!projectState?.url}><RefreshCcw size={13}/></button><button onClick={onInspectPreview} disabled={!projectState?.url}><Bug size={13}/> Inspect</button><button onClick={onScreenshot} disabled={!projectState?.url}><Camera size={13}/> Screenshot</button><button onClick={onExternal} disabled={!projectState?.url}><ExternalLink size={13}/></button></div>
          {projectState?.url ? <iframe title="Project Preview" src={projectState.url} sandbox="allow-scripts allow-forms allow-same-origin allow-popups"/> : <div className="code-empty small"><MonitorPlay size={28}/><b>شغّل المشروع أول</b></div>}
          {previewInspect?.consoleErrors?.length>0 && <div className="preview-errors">Console errors: {previewInspect.consoleErrors.length} · Network: {previewInspect.networkErrors?.length||0}</div>}
        </div>}
        {bottomTab==='agent' && <div className="agent-result-pane"><FormattedText text={lastAssistant || 'أرسل مهمة للـCoding Agent من مربع الكتابة تحت.'}/></div>}
        {bottomTab==='git' && <pre className="runner-log">{`STATUS\n${gitState?.status||'—'}\n\nDIFF\n${gitState?.diff||'—'}\n\nLOG\n${gitState?.log||'—'}`}</pre>}
      </div>
    </div>
  </div>;
}

function TerminalPane({ workspace }) {
  const hostRef=useRef(null);
  const terminalRef=useRef(null);
  const fitRef=useRef(null);
  const sessionRef=useRef('');
  useEffect(()=>{
    if(!workspace||!hostRef.current)return;
    let disposed=false;
    const term=new Terminal({convertEol:true,cursorBlink:true,fontSize:12,fontFamily:'Cascadia Code, Consolas, monospace',theme:{background:'#030912',foreground:'#b8c9db',cursor:'#6aa9ff',selectionBackground:'#294766'}});
    const fit=new FitAddon();term.loadAddon(fit);term.open(hostRef.current);fit.fit();terminalRef.current=term;fitRef.current=fit;
    const off=window.abdx.onTerminalData?.((evt)=>{if(evt?.id===sessionRef.current)term.write(evt.data||'');});
    const dataSub=term.onData(data=>{if(sessionRef.current)window.abdx.terminalWrite({id:sessionRef.current,data});});
    const resize=()=>{try{fit.fit();}catch{}};window.addEventListener('resize',resize);
    (async()=>{try{const s=await window.abdx.terminalStart({root:workspace});if(disposed){if(s?.id)window.abdx.terminalKill(s.id);return;}sessionRef.current=s.id;term.write(`\r\n[session ${s.id.slice(0,8)}]\r\n`);}catch(e){term.write(`\r\n[terminal start failed] ${e.message||e}\r\n`);}})();
    return()=>{disposed=true;off?.();dataSub?.dispose();window.removeEventListener('resize',resize);if(sessionRef.current)window.abdx.terminalKill(sessionRef.current);term.dispose();};
  },[workspace]);
  return <div className="terminal-host" ref={hostRef}/>;
}


function ResearchPanel({ status, sources, meta, onBrowse }) {
  const providers = status?.providers || {};
  const providerText = [
    providers.searxng?.reachable ? 'SearXNG' : null,
    providers.brave?.configured ? 'Brave' : null,
    providers.duckduckgo?.configured ? 'DuckDuckGo' : null
  ].filter(Boolean).join(' + ') || 'غير متاح';
  return <div className="file-intelligence research-panel">
    <div className="intel-card research-status-card">
      <div className="intel-head"><div><Globe2 size={17}/><span><b>Deep Research Engine</b><small>{providerText}</small></span></div><span className="intel-size">{meta?.level?.toUpperCase() || 'READY'}</span></div>
      <div className="intel-grid"><div><small>Browser Reader</small><b>{status?.browser_reader ? 'ON' : 'OFF'}</b></div><div><small>Private Network</small><b>{status?.security?.blocks_private_network ? 'BLOCKED' : 'ALLOWED'}</b></div><div><small>Queries</small><b>{meta?.queries?.length || 0}</b></div><div><small>Sources</small><b>{sources?.length || 0}</b></div></div>
      <div className="research-trust"><ShieldAlert size={14}/><span>محتوى الويب يُعامل كدليل غير موثوق من ناحية التعليمات، والـAgent ما يتبع prompts الموجودة داخل المصادر.</span></div>
    </div>
    <div className="research-sources">
      {!sources?.length ? <div className="empty-state"><BookOpen size={26}/><b>مصادر البحث</b><p>اختر وضع بحث عميق، اكتب الموضوع، وبعد التنفيذ بتظهر المصادر هنا مع [SRC#] والجودة.</p></div> : sources.map((src,i) => <div className="research-source" key={`${src.citation}-${i}`}>
        <div className="research-source-head"><b>[{src.citation || `SRC${i+1}`}] {src.title}</b><span>{src.quality || 60}%</span></div>
        <small>{src.host || src.provider}{src.published ? ` · ${src.published}` : ''}</small>
        <p>{src.excerpt || src.description || 'لا يوجد مقتطف.'}</p>
        <button onClick={() => onBrowse?.(src)}><ExternalLink size={12}/> قراءة المصدر</button>
      </div>)}
    </div>
  </div>;
}

function KnowledgePanel({ knowledge, results, busy, onClear }) {
  return <div className="file-intelligence knowledge-panel">
    <div className="intel-card">
      <div className="intel-head"><div><Database size={17}/><span><b>Knowledge Base</b><small>Persistent local RAG</small></span></div>{busy && <Loader2 className="spin" size={16}/>}</div>
      <div className="intel-grid"><div><small>الملفات</small><b>{knowledge.documents || 0}</b></div><div><small>Chunks</small><b>{knowledge.chunks || 0}</b></div><div><small>Embeddings</small><b>{knowledge.embedded_chunks || 0}</b></div><div><small>البحث</small><b>{knowledge.hybrid_ready ? 'Hybrid' : 'Lexical'}</b></div></div>
      <div className="kb-model"><small>Embedding model</small><code>{knowledge.embedding_model || 'غير مثبت — البحث النصي يعمل'}</code></div>
      <button className="kb-clear" onClick={onClear}><Eraser size={14}/> مسح الفهرس فقط</button>
    </div>
    <div className="kb-results">
      {!results?.length ? <div className="empty-state"><BookOpen size={26}/><b>مصادر RAG</b><p>فهرس ملفاتك ثم ابحث. كل نتيجة تحتفظ باسم الملف والموضع ورمز citation.</p></div> : results.map((r,i) => <div className="kb-result" key={`${r.id}-${i}`}><div><b>[{r.citation || `KB${i+1}`}] {r.name}</b><small>{r.locator || 'document'} · {(r.matched_by || []).join(' + ')}</small></div><p>{r.snippet}</p><code title={r.path}>{r.path}</code></div>)}
    </div>
  </div>;
}

function FileInfoCard({ info }) {
  if (!info) return null;
  if (info.success === false) return <div className="intel-card error"><b>تعذر فحص الملف</b><p>{info.error}</p></div>;
  const details = [];
  if (info.page_count != null) details.push(['الصفحات', info.page_count]);
  if (info.sheet_count != null) details.push(['Sheets', info.sheet_count]);
  if (info.slide_count != null) details.push(['الشرائح', info.slide_count]);
  if (info.table_count != null) details.push(['الجداول', info.table_count]);
  if (info.image_count != null) details.push(['الصور', info.image_count]);
  if (info.formula_count != null) details.push(['Formulas', info.formula_count]);
  if (info.entry_count != null) details.push(['ZIP entries', info.entry_count]);
  return <div className="intel-card"><div className="intel-head"><div><FileSearch size={17}/><span><b>{info.name}</b><small>{info.type || info.extension}</small></span></div><span className="intel-size">{humanBytes(info.bytes)}</span></div><div className="intel-grid"><div><small>النوع</small><b>{info.type || 'file'}</b></div><div><small>الحجم</small><b>{humanBytes(info.bytes)}</b></div>{details.map(([k,v]) => <div key={k}><small>{k}</small><b>{String(v)}</b></div>)}</div>{info.needs_ocr && <div className="ocr-alert"><ScanText size={15}/><div><b>يحتاج OCR / Vision</b><small>صفحات مرشحة: {(info.scanned_candidate_pages || []).slice(0,12).join(', ') || 'غير محدد'}</small></div></div>}<div className="hash-row"><small>SHA-256</small><code>{info.sha256 || '—'}</code></div></div>;
}

function CompareCard({ result }) {
  if (!result?.comparisons?.length) return null;
  return <div className="intel-card compare-card"><div className="intel-head"><div><GitCompare size={17}/><span><b>مقارنة الملفات</b><small>{result.files?.length || 0} ملفات</small></span></div></div>{result.comparisons.map((c, i) => <div className="compare-item" key={i}><div><b>{(c.similarity * 100).toFixed(1)}%</b><span>تشابه</span></div><small>{basename(c.against)}</small><p>مختلف من الملف الأساسي: {c.only_in_base?.length || 0} · مختلف في هذا الملف: {c.only_in_other?.length || 0}</p></div>)}</div>;
}

function MemoryPanel({status,items,busy,workspace,onRefresh,onDelete}) {
  return <div className="memory-panel">
    <div className="memory-summary"><div><BrainCircuit size={20}/><b>Long-term Memory</b><small>{workspace?'Global + Project Memory':'Global Memory'}</small></div><button className="icon-btn" onClick={onRefresh} disabled={busy}><RefreshCw className={busy?'spin':''} size={15}/></button></div>
    <div className="memory-stats"><div><b>{status?.total||0}</b><span>Total</span></div><div><b>{status?.global||0}</b><span>Global</span></div><div><b>{status?.project||0}</b><span>Project</span></div></div>
    <div className="memory-list">{items?.length?items.map(m=><div className="memory-item" key={m.id}><div className="memory-item-head"><span>{m.scope==='project'?'PROJECT':'GLOBAL'} · {m.kind}</span><b>{m.importance}%</b></div><p>{m.content}</p><div className="memory-item-foot"><small>{m.updated_at?new Date(m.updated_at).toLocaleString():''}</small><button onClick={()=>onDelete?.(m.id)} title="حذف الذاكرة"><Trash2 size={13}/></button></div></div>):<div className="empty-state"><BrainCircuit size={27}/><b>ما فيه ذكريات محفوظة</b><p>التفضيلات وقرارات المشروع المهمة تظهر هنا.</p></div>}</div>
  </div>;
}

function IntelligencePanel({info,current,dag,onCancel}) {
  const plan=current?.plan; const evaluation=current?.evaluation;
  return <div className="file-intelligence intelligence-panel">
    <div className="intel-card"><div className="intel-head"><div><BrainCircuit size={17}/><span><b>Production Intelligence Core</b><small>Unified Planner · DAG Executor · Worktree Sandbox · Transactions · Verification Gates</small></span></div><span className="intel-size">v{info?.version||'2.5.1'}</span></div>
      <div className="intel-grid"><div><small>Plans</small><b>{info?.stats?.plans||0}</b></div><div><small>Team</small><b>{info?.stats?.teamPlans||0}</b></div><div><small>Single</small><b>{info?.stats?.singlePlans||0}</b></div><div><small>Agents</small><b>{info?.registry?.agents?.length||0}</b></div></div>
    </div>
    {(dag?.activeRuns||[]).map(r=><div className="intel-card" key={r.id}><div className="intel-head"><div><Activity size={17}/><span><b>DAG RUNNING</b><small>{r.id}</small></span></div><button className="dag-cancel" onClick={()=>onCancel?.(r.id)}>Cancel</button></div><div className="route-plan"><div><span>Workspace</span><code>{r.metadata?.workspace||'—'}</code></div><div><span>Agents</span><code>{(r.metadata?.agents||[]).join(', ')}</code></div></div><small>Cancellation is cooperative: it stops new nodes; an active native/tool operation is allowed to settle safely.</small></div>)}
    {!plan?<div className="empty-state"><Sparkles size={27}/><b>ما فيه Plan نشطة</b><p>أرسل مهمة، والـUnified Planner سيعرض القرار والـTask Graph هنا.</p></div>:<div className="intel-card"><div className="intel-head"><div><ListChecks size={17}/><span><b>{plan.primaryAgent} · {plan.strategy}</b><small>{plan.rationale}</small></span></div><span className="intel-size">{String(plan.risk||'low').toUpperCase()}</span></div>
      <div className="intel-grid"><div><small>Type</small><b>{plan.classification?.primary}</b></div><div><small>Complexity</small><b>{plan.classification?.complexity}/6</b></div><div><small>Compute</small><b>{plan.estimate?.computeScore}/100</b></div><div><small>Latency</small><b>{plan.estimate?.latencyScore}/100</b></div></div>
      {current?.execution?.run&&<div className="route-plan"><b>DAG Executor</b><div><span>Status</span><code>{current.execution.run.status}</code></div><div><span>Nodes</span><code>{current.execution.run.nodeCount||0}</code></div><div><span>Max parallel</span><code>{current.execution.run.parallelObserved||1}</code></div><div><span>Duration</span><code>{current.execution.run.durationMs||0} ms</code></div></div>}
      <div className="planner-agents">{(plan.agents||[]).map(a=><span key={a}>{a}</span>)}</div>
      <div className="planner-graph">{(plan.graph?.nodes||[]).map((n,i)=><div key={n.id}><b>{i+1}</b><span>{n.label}</span><small>{(n.dependsOn||[]).length?`after ${(n.dependsOn||[]).join(', ')}`:'start'}</small></div>)}</div>
      <div className="planner-gates"><b>Verification Gates</b>{(evaluation?.gates||plan.gates||[]).map(g=><div className={g.passed===false?'gate-fail':'gate-ok'} key={g.id}><span>{g.passed===false?'FAIL':g.passed===true?'PASS':'REQ'} · {g.label}</span><small>{g.reason||g.type}</small></div>)}</div>
      {evaluation&&<div className={`self-eval ${evaluation.status==='PARTIAL'?'bad':''}`}><ShieldCheck size={16}/><b>{evaluation.status} · {evaluation.score}%</b><span>{evaluation.gateFailures||0} gate failures</span></div>}
    </div>}
  </div>;
}

function TransactionPanel({info,workspace,onRefresh,onRollback,onDiff,onPreview}) {
  const txs=info?.transactions||[];
  return <div className="file-intelligence transaction-panel">
    <div className="intel-card"><div className="intel-head"><div><Archive size={17}/><span><b>Transactional Workspace</b><small>Snapshot → Agent Mutation → Diff → Verification → Commit / Rollback</small></span></div><button className="icon-btn" onClick={onRefresh}><RefreshCw size={14}/></button></div>
      <div className="intel-grid"><div><small>Workspace</small><b>{workspace?'OPEN':'—'}</b></div><div><small>Active</small><b>{info?.active?'1':'0'}</b></div><div><small>History</small><b>{txs.length}</b></div><div><small>Policy</small><b>AUTO</b></div></div>
    </div>
    {!workspace?<div className="empty-state"><FolderOpen size={26}/><b>افتح Workspace</b><p>الـTransactions مرتبطة بالمشروع الحالي.</p></div>:!txs.length?<div className="empty-state"><ShieldCheck size={26}/><b>ما فيه Transactions بعد</b><p>أول مهمة تعديل ينفذها الـAgent ستأخذ Snapshot تلقائيًا.</p></div>:txs.map(tx=><div className={`intel-card tx-card tx-${String(tx.status||'').toLowerCase()}`} key={tx.id}><div className="intel-head"><div><Archive size={16}/><span><b>{tx.status}</b><small>{tx.id}</small></span></div><span className="intel-size">{tx.diff?.summary?.changedFiles??0} files</span></div><div className="route-plan"><div><span>Created</span><code>{tx.createdAt?new Date(tx.createdAt).toLocaleString():'—'}</code></div><div><span>Snapshot</span><code>{tx.snapshot?.files||0} files</code></div>{tx.diff?.summary&&<><div><span>Modified</span><code>{tx.diff.summary.modified||0}</code></div><div><span>Added / Deleted</span><code>{tx.diff.summary.added||0} / {tx.diff.summary.deleted||0}</code></div></>}</div>{(tx.diff?.files||[]).length>0&&<div className="tx-files">{tx.diff.files.slice(0,8).map(f=><button key={f.path} onClick={()=>onPreview?.(tx.id,f.path)}><span>{f.type}</span><code>{f.path}</code></button>)}</div>}{tx.rollbackReason&&<small className="warn-text">{tx.rollbackReason}</small>}<div className="settings-actions"><button onClick={()=>onDiff?.(tx.id)}><GitCompare size={13}/> Diff Summary</button>{tx.status==='ACTIVE'&&<button className="write-action high" onClick={()=>onRollback?.(tx.id)}><RotateCw size={13}/> Rollback Active</button>}</div></div>)}
  </div>;
}


function WorktreePanel({info,onRefresh,onPreview}) {
  const rows=info?.sandboxes||[];
  return <div className="file-intelligence transaction-panel">
    <div className="intel-card"><div className="intel-head"><div><GitBranch size={17}/><span><b>Isolated Worktree Sandbox</b><small>Git Worktree → Build/Test → Binary Patch → Original Merge</small></span></div><button className="icon-btn" onClick={onRefresh}><RefreshCw size={14}/></button></div>
      <div className="intel-grid"><div><small>Active</small><b>{info?.active?.length||0}</b></div><div><small>History</small><b>{rows.length}</b></div><div><small>Patch Limit</small><b>{Math.round((info?.limits?.maxPatchBytes||0)/1024/1024)||32} MB</b></div><div><small>Clean Git</small><b>{info?.limits?.requireClean===false?'OPTIONAL':'REQUIRED'}</b></div></div>
    </div>
    {!rows.length?<div className="empty-state"><GitBranch size={26}/><b>ما فيه Sandboxes بعد</b><p>مهمة Coder على Git Workspace نظيف ستشتغل في Worktree منفصل تلقائيًا.</p></div>:rows.map(w=><div className={`intel-card tx-card tx-${String(w.status||'').toLowerCase()}`} key={w.id}><div className="intel-head"><div><GitBranch size={16}/><span><b>{w.status}</b><small>{w.id}</small></span></div><span className="intel-size">{w.patch?.files?.length||0} files</span></div><div className="route-plan"><div><span>Base HEAD</span><code>{String(w.baseHead||'').slice(0,12)||'—'}</code></div><div><span>Patch</span><code>{humanBytes(w.patch?.bytes||0)}</code></div><div><span>Created</span><code>{w.createdAt?new Date(w.createdAt).toLocaleString():'—'}</code></div><div><span>Merged</span><code>{w.mergedAt?'YES':'—'}</code></div></div>{w.abortReason&&<small className="warn-text">{w.abortReason}</small>}<div className="settings-actions">{w.patch?.bytes>0&&<button onClick={()=>onPreview?.(w.id)}><GitCompare size={13}/> Patch Preview</button>}</div></div>)}
  </div>;
}


function EvaluationPanel({info,busy,onRefresh,onRun,onRunLive,onBaseline}) {
  const run=info?.lastRun;
  const gate=run?.releaseGate?.status||'NOT RUN';
  return <div className="intel-panel">
    <div className="intel-card"><div className="intel-head"><div><TestTube2 size={17}/><span><b>Agent Test Lab</b><small>Benchmarks · Regression Baseline · Tool Metrics · Release Gate</small></span></div><span className={`intel-size ${gate==='BLOCK'?'bad-text':gate==='PASS'?'ok-text':''}`}>{gate}</span></div>
      <div className="route-plan"><div><span>Score</span><code>{run?.score!=null?`${run.score}%`:'—'}</code></div><div><span>Baseline</span><code>{info?.baseline?`${info.baseline.score}%`:'—'}</code></div><div><span>Threshold</span><code>{info?.regressionThreshold||8} pts</code></div><div><span>Tools tracked</span><code>{info?.toolMetrics?.length||0}</code></div></div>
      <div className="settings-actions"><button className="primary" disabled={busy} onClick={onRun}>{busy?<Loader2 className="spin" size={13}/>:<TestTube2 size={13}/>} Release Suite</button><button disabled={busy} onClick={onRunLive}><BrainCircuit size={13}/> Live Models</button><button disabled={!run||gate==='BLOCK'} onClick={onBaseline}><GitCommit size={13}/> Baseline</button><button onClick={onRefresh}><RefreshCw size={13}/> Refresh</button></div>
    </div>
    {run?.releaseGate?.reasons?.length>0&&<div className={`intel-card ${gate==='BLOCK'?'tx-failed':''}`}><b>Release Gate</b>{run.releaseGate.reasons.map((r,i)=><small key={i} className={gate==='BLOCK'?'bad-text':''}>{r}</small>)}</div>}
    <div className="resource-decisions"><b>Latest suites</b>{(run?.suites||[]).map((x,i)=><div className="resource-decision" key={x.id||i}><div><strong>{x.id}</strong><small>{x.passed}/{x.total} · {x.critical?'critical':'non-blocking'} · {x.avgLatencyMs||0} ms avg</small></div><span>{x.score}%</span></div>)}{!run&&<small>ما فيه Evaluation Run حتى الآن.</small>}</div>
    <div className="resource-decisions"><b>Tool success metrics</b>{(info?.toolMetrics||[]).slice(0,12).map((x,i)=><div className="resource-decision" key={x.name||i}><div><strong>{x.name}</strong><small>{x.success}/{x.calls} success · {x.avgLatencyMs} ms avg</small></div><span>{x.successRate}%</span></div>)}{!(info?.toolMetrics||[]).length&&<small>تظهر المقاييس بعد استخدام أدوات الـAgent.</small>}</div>
  </div>;
}

function LanePanel({info,onRefresh,onPreview}) {
  const rows=info?.bundles||[];
  return <div className="intel-panel">
    <div className="intel-card"><div className="intel-head"><div><GitCompare size={17}/><span><b>Parallel Isolated Coding Lanes</b><small>Independent Worktrees → Region Conflict Detector → Integration Worktree → Verified Merge</small></span></div><button className="icon-btn" onClick={onRefresh}><RefreshCw size={14}/></button></div>
      <div className="route-plan"><div><span>Active bundles</span><code>{info?.active?.length||0}</code></div><div><span>History</span><code>{rows.length}</code></div><div><span>Policy</span><code>DISJOINT OR BEST VERIFIED</code></div></div>
    </div>
    {!rows.length?<div className="empty-state"><GitCompare size={26}/><b>ما فيه Parallel Lane Bundles بعد</b><p>المهام البرمجية المعقدة على Git Workspace نظيف تستخدم Lanes مستقلة تلقائيًا عند أهلية الـPlanner.</p></div>:rows.map(b=><div className={`intel-card tx-card tx-${String(b.status||'').toLowerCase()}`} key={b.id}><div className="intel-head"><div><GitCompare size={16}/><span><b>{b.status}</b><small>{b.id}</small></span></div><span className="intel-size">{b.laneIds?.length||0} lanes</span></div><div className="route-plan"><div><span>Base HEAD</span><code>{String(b.baseHead||'').slice(0,12)||'—'}</code></div><div><span>Patch</span><code>{humanBytes(b.patch?.bytes||0)}</code></div><div><span>Conflict policy</span><code>{b.metadata?.conflictResolution || (b.plan?.mergeable===false?'BEST VERIFIED':'REGION SAFE')}</code></div><div><span>Committed</span><code>{b.committedAt?'YES':'—'}</code></div></div>{(b.plan?.conflicts||[]).length>0&&<small className="warn-text">Detected {b.plan.conflicts.length} conflicting lane pair(s).</small>}{b.reason&&<small className="warn-text">{b.reason}</small>}<div className="settings-actions">{b.patch?.bytes>0&&<button onClick={()=>onPreview?.(b.id)}><GitCompare size={13}/> Bundle Patch</button>}</div></div>)}
  </div>;
}

function SettingsCenter({settings,onSave,diagnostics,diagnosticsBusy,onDiagnostics,onExportDiagnostics,backups,backupBusy,onBackup,onRestore,onOpenBackupFolder,updateInfo,models,systemProfile,modelPlan,resourceInfo,onRefreshResources,intelligenceInfo,worktreeInfo,onRefreshIntelligence,evaluationInfo,evaluationBusy,onRefreshEvaluations,onRunEvaluation,onPromoteEvaluationBaseline,modelBusy,onRefreshModels,onPullModel,onStopModel,integrationStatus,integrationAudit,integrationApprovals,integrationBusy,integrationResult,onRefreshIntegrations,onIntegrationQuery,onIntegrationPropose,onIntegrationApprove,onIntegrationReject,workspace,runtimeInfo,runtimeBusy,recoveryInfo,onRuntimeRefresh,onRuntimeAction,onClose}) {
  const [tab,setTab]=useState('general');
  const [draft,setDraft]=useState(settings||{});
  const [pullName,setPullName]=useState('');
  const [prTitle,setPrTitle]=useState('');
  const [prBase,setPrBase]=useState('');
  useEffect(()=>setDraft(settings||{}),[settings]);
  const set=(k,v)=>setDraft(p=>({...p,[k]:v}));
  const health=diagnostics?.score ?? null;
  return <div className="modal-backdrop"><div className="settings-modal">
    <div className="settings-head"><div><Settings size={19}/><div><b>ABDULKAREM AI X — Control Center</b><small>Settings · Models · Intelligence · Test Lab · Performance · Runtime/Recovery · Integrations · Diagnostics · Backup · Updates</small></div></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="settings-body">
      <div className="settings-tabs">
        <button className={tab==='general'?'active':''} onClick={()=>setTab('general')}><Settings size={15}/> عام</button>
        <button className={tab==='models'?'active':''} onClick={()=>setTab('models')}><BrainCircuit size={15}/> Models</button>
        <button className={tab==='intelligence'?'active':''} onClick={()=>setTab('intelligence')}><Sparkles size={15}/> Intelligence</button>
        <button className={tab==='evaluation'?'active':''} onClick={()=>setTab('evaluation')}><TestTube2 size={15}/> Test Lab</button>
        <button className={tab==='performance'?'active':''} onClick={()=>setTab('performance')}><Gauge size={15}/> Performance</button>
        <button className={tab==='runtime'?'active':''} onClick={()=>setTab('runtime')}><MonitorPlay size={15}/> Runtime</button>
        <button className={tab==='integrations'?'active':''} onClick={()=>setTab('integrations')}><GitBranch size={15}/> Integrations</button>
        <button className={tab==='health'?'active':''} onClick={()=>setTab('health')}><HeartPulse size={15}/> Diagnostics {health!=null&&<span className={`health-mini ${health>=80?'ok':'warn'}`}>{health}%</span>}</button>
        <button className={tab==='backup'?'active':''} onClick={()=>setTab('backup')}><Archive size={15}/> Backup</button>
        <button className={tab==='update'?'active':''} onClick={()=>setTab('update')}><PackageCheck size={15}/> Update</button>
      </div>
      <div className="settings-content">
        {tab==='general' && <div className="settings-section">
          <h3>تجربة التطبيق</h3>
          <div className="settings-grid">
            <label><span>Appearance</span><select value={draft.appearance||'dark'} onChange={e=>set('appearance',e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label>
            <label><span>Accent</span><select value={draft.accent||'blue'} onChange={e=>set('accent',e.target.value)}><option value="blue">Blue</option><option value="indigo">Indigo</option><option value="emerald">Emerald</option><option value="violet">Violet</option></select></label>
            <label><span>Research default</span><select value={draft.researchLevel||'deep'} onChange={e=>set('researchLevel',e.target.value)}><option value="quick">QUICK</option><option value="deep">DEEP</option><option value="expert">EXPERT</option><option value="max">MAX</option></select></label>
            <label className="toggle-line"><input type="checkbox" checked={Boolean(draft.teamMode)} onChange={e=>set('teamMode',e.target.checked)}/><span>TEAM AUTO افتراضيًا</span></label>
            <label className="toggle-line"><input type="checkbox" checked={Boolean(draft.compactSidebar)} onChange={e=>set('compactSidebar',e.target.checked)}/><span>Sidebar مضغوط</span></label>
            <label className="toggle-line"><input type="checkbox" checked={Boolean(draft.autoBackup)} onChange={e=>set('autoBackup',e.target.checked)}/><span>Auto Backup</span></label>
            <label className="toggle-line"><input type="checkbox" checked={Boolean(draft.startupHealthCheck)} onChange={e=>set('startupHealthCheck',e.target.checked)}/><span>Health Check عند التشغيل</span></label>
            <label className="toggle-line"><input type="checkbox" checked={Boolean(draft.showVerification)} onChange={e=>set('showVerification',e.target.checked)}/><span>إظهار Verification Score</span></label><label className="toggle-line"><input type="checkbox" checked={draft.memoryEnabled!==false} onChange={e=>set('memoryEnabled',e.target.checked)}/><span>Long-term Memory</span></label><label className="toggle-line"><input type="checkbox" checked={draft.memoryAutoCapture!==false} onChange={e=>set('memoryAutoCapture',e.target.checked)}/><span>Auto-capture للتفضيلات والقرارات</span></label><label><span>Memory context chars</span><input type="number" min="2000" max="30000" step="1000" value={draft.memoryMaxContextChars||12000} onChange={e=>set('memoryMaxContextChars',Number(e.target.value)||12000)}/></label>
            <label><span>Performance</span><select value={draft.performanceProfile||'balanced'} onChange={e=>set('performanceProfile',e.target.value)}><option value="eco">ECO</option><option value="balanced">BALANCED</option><option value="max">MAX</option></select></label>
            <label><span>General Model</span><select value={draft.preferredGeneralModel||'auto'} onChange={e=>set('preferredGeneralModel',e.target.value)}><option value="auto">AUTO</option>{(models||[]).map(m=><option key={`g-${m.name}`} value={m.name}>{m.name}</option>)}</select></label>
            <label><span>Coding Model</span><select value={draft.preferredCodingModel||'auto'} onChange={e=>set('preferredCodingModel',e.target.value)}><option value="auto">AUTO</option>{(models||[]).map(m=><option key={`c-${m.name}`} value={m.name}>{m.name}</option>)}</select></label>
            <label><span>Vision Model</span><select value={draft.preferredVisionModel||'auto'} onChange={e=>set('preferredVisionModel',e.target.value)}><option value="auto">AUTO</option>{(models||[]).map(m=><option key={`v-${m.name}`} value={m.name}>{m.name}</option>)}</select></label>
            <label><span>عدد النسخ المحفوظة</span><input type="number" min="1" max="30" value={draft.backupKeep||5} onChange={e=>set('backupKeep',Number(e.target.value)||5)}/></label>
          </div>
          <div className="settings-actions"><button className="primary" onClick={async()=>{await onSave?.(draft);}}><Save size={14}/> حفظ الإعدادات</button></div>
        </div>}
        {tab==='models' && <div className="settings-section model-manager-section">
          <div className="model-manager-hero"><div><h3>Model Manager</h3><p>يعرض موارد الجهاز ومسارات النماذج المقترحة. ما فيه أي وظيفة حذف للنماذج.</p></div><button className="primary" onClick={onRefreshModels} disabled={modelBusy}>{modelBusy?<Loader2 className="spin" size={14}/>:<RefreshCw size={14}/>} تحديث</button></div>
          <div className="hardware-grid"><div><small>RAM</small><b>{humanBytes(systemProfile?.ramTotal||0)}</b><span>{systemProfile?.memoryClass||'—'}</span></div><div><small>Free RAM</small><b>{humanBytes(systemProfile?.ramFree||0)}</b><span>{systemProfile?.cpuCount||0} CPU threads</span></div><div><small>GPU / VRAM</small><b>{systemProfile?.gpus?.[0]?.name||'غير محدد'}</b><span>{systemProfile?.maxVram?humanBytes(systemProfile.maxVram):'VRAM غير متاحة'}</span></div></div>
          <div className="route-plan"><b>Smart Model Plan</b><div><span>General</span><code>{modelPlan?.routes?.general||'—'}</code></div><div><span>Coding</span><code>{modelPlan?.routes?.coding||'—'}</code></div><div><span>Vision</span><code>{modelPlan?.routes?.vision||'—'}</code></div>{modelPlan?.notes?.map((n,i)=><small key={i}>{n}</small>)}</div>
          <div className="model-list"><b>Installed Models ({models?.length||0})</b>{(models||[]).map(m=><div className="model-row-v11" key={m.name}><div><strong>{m.name}</strong><small>{humanBytes(m.size)}{systemProfile?.protectedModels?.includes(m.name)?' · PROTECTED':''}</small></div><button onClick={()=>onStopModel?.(m.name)} disabled={modelBusy}>Unload RAM</button></div>)}</div>
          <div className="model-pull"><input value={pullName} onChange={e=>setPullName(e.target.value)} placeholder="مثال: qwen3-embedding:4b"/><button className="primary" onClick={async()=>{await onPullModel?.(pullName);setPullName('');}} disabled={modelBusy||!pullName.trim()}><Download size={14}/> Pull Model</button></div>
          <div className="release-note">الحماية: التطبيق لا يوفّر Model Delete، وqwen3-coder:30b مسجّل كنموذج PROTECTED.</div>
        </div>}
        {tab==='intelligence' && <div className="settings-section intelligence-section">
          <div className="model-manager-hero"><div><h3>Production Intelligence Core v2.5</h3><p>Unified Planner + DAG + Parallel Isolated Coding Lanes + Conflict-Safe Merge + Transactional Rollback + Release Evaluation Gate.</p></div><button className="primary" onClick={()=>onRefreshIntelligence?.()}><RefreshCw size={14}/> تحديث</button></div>
          <div className="intel-grid intelligence-stats"><div><small>Plans</small><b>{intelligenceInfo?.stats?.plans||0}</b></div><div><small>Team</small><b>{intelligenceInfo?.stats?.teamPlans||0}</b></div><div><small>Single</small><b>{intelligenceInfo?.stats?.singlePlans||0}</b></div><div><small>Gate failures</small><b>{intelligenceInfo?.stats?.gateFailures||0}</b></div></div>
          <div className="settings-grid">
            <label className="toggle-row"><span>Production Intelligence Core</span><input type="checkbox" checked={draft.intelligenceEnabled!==false} onChange={e=>set('intelligenceEnabled',e.target.checked)}/></label>
            <label className="toggle-row"><span>Auto Team للمهام المعقدة</span><input type="checkbox" checked={draft.intelligenceAutoTeam!==false} onChange={e=>set('intelligenceAutoTeam',e.target.checked)}/></label>
            <label className="toggle-row"><span>Verification Gates</span><input type="checkbox" checked={draft.intelligenceVerificationGate!==false} onChange={e=>set('intelligenceVerificationGate',e.target.checked)}/></label>
            <label className="toggle-row"><span>Parallel DAG Execution</span><input type="checkbox" checked={draft.intelligenceParallelExecution!==false} onChange={e=>set('intelligenceParallelExecution',e.target.checked)}/></label>
            <label><span>Max Agents</span><input type="number" min="1" max="5" value={draft.intelligenceMaxAgents||5} onChange={e=>set('intelligenceMaxAgents',Math.max(1,Math.min(5,Number(e.target.value||5))))}/></label>
            <label><span>Max Parallel Nodes</span><input type="number" min="1" max="6" value={draft.intelligenceMaxParallel||3} onChange={e=>set('intelligenceMaxParallel',Math.max(1,Math.min(6,Number(e.target.value||3))))}/></label>
            <label><span>Mutation Lock Timeout (ms)</span><input type="number" min="5000" max="600000" step="5000" value={draft.intelligenceMutationLockTimeoutMs||120000} onChange={e=>set('intelligenceMutationLockTimeoutMs',Math.max(5000,Math.min(600000,Number(e.target.value||120000))))}/></label>
            <label className="toggle-row"><span>Transactional Workspace</span><input type="checkbox" checked={draft.transactionalWorkspaceEnabled!==false} onChange={e=>set('transactionalWorkspaceEnabled',e.target.checked)}/></label>
            <label className="toggle-row"><span>Auto Rollback عند فشل Verification</span><input type="checkbox" checked={draft.transactionAutoRollback!==false} onChange={e=>set('transactionAutoRollback',e.target.checked)}/></label>
            <label className="toggle-row"><span>Include Tests in Commit Gate</span><input type="checkbox" checked={Boolean(draft.transactionIncludeTests)} onChange={e=>set('transactionIncludeTests',e.target.checked)}/></label>
            <label><span>Transaction Max Files</span><input type="number" min="100" max="100000" step="100" value={draft.transactionMaxFiles||20000} onChange={e=>set('transactionMaxFiles',Math.max(100,Number(e.target.value||20000)))}/></label>
            <label><span>Snapshot Max MB</span><input type="number" min="10" max="2048" step="10" value={draft.transactionMaxMb||250} onChange={e=>set('transactionMaxMb',Math.max(10,Number(e.target.value||250)))}/></label>
            <label className="toggle-row"><span>Isolated Git Worktree Sandbox</span><input type="checkbox" checked={draft.worktreeSandboxEnabled!==false} onChange={e=>set('worktreeSandboxEnabled',e.target.checked)}/></label>
            <label><span>Verified Patch Max MB</span><input type="number" min="1" max="512" step="1" value={draft.worktreeMaxPatchMb||32} onChange={e=>set('worktreeMaxPatchMb',Math.max(1,Number(e.target.value||32)))}/></label>
            <label className="toggle-row"><span>Parallel Isolated Coding Lanes</span><input type="checkbox" checked={draft.parallelCodingLanesEnabled!==false} onChange={e=>set('parallelCodingLanesEnabled',e.target.checked)}/></label>
            <label><span>Coding Lane Count</span><input type="number" min="2" max="3" value={draft.parallelCodingLaneCount||2} onChange={e=>set('parallelCodingLaneCount',Math.max(2,Math.min(3,Number(e.target.value||2))))}/></label>
            <label><span>Lane Bundle Max MB</span><input type="number" min="1" max="1024" value={draft.laneMaxBundleMb||64} onChange={e=>set('laneMaxBundleMb',Math.max(1,Number(e.target.value||64)))}/></label>
          </div>
          <div className="route-plan"><b>Worktree Sandbox</b><div><span>Active</span><code>{worktreeInfo?.active?.length||0}</code></div><div><span>History</span><code>{worktreeInfo?.sandboxes?.length||0}</code></div><div><span>Policy</span><code>{draft.worktreeSandboxEnabled!==false?'VERIFY → PATCH → MERGE':'OFF'}</code></div></div>
          <div className="route-plan"><b>Capability Registry</b><div><span>Agents</span><code>{intelligenceInfo?.registry?.agents?.length||0}</code></div><div><span>Tool groups</span><code>{Object.keys(intelligenceInfo?.registry?.toolGroups||{}).length}</code></div><div><span>Skills</span><code>{intelligenceInfo?.registry?.skills?.length||0}</code></div><div><span>Cloud Approval</span><code>{intelligenceInfo?.registry?.invariants?.humanApprovalForCloudMutations?'MANDATORY':'—'}</code></div></div>
          <div className="resource-decisions"><b>Recent Plans</b>{(intelligenceInfo?.recentPlans||[]).slice(0,8).map((p,i)=><div className="resource-decision" key={p.id||i}><div><strong>{p.primaryAgent} · {p.strategy}</strong><small>{p.classification?.primary} · complexity {p.classification?.complexity}/6 · {p.risk} risk</small></div><span>{p.estimate?.computeScore||0}/100</span><p>{p.rationale}</p></div>)}{!(intelligenceInfo?.recentPlans||[]).length&&<small>أرسل مهمة لبدء سجل Unified Planner.</small>}</div>
          <div className="settings-actions"><button className="primary" onClick={async()=>{await onSave?.(draft);await onRefreshIntelligence?.();}}><Save size={14}/> حفظ وتطبيق</button></div>
          <div className="release-note">في v2.5 المهام البرمجية المعقدة المؤهلة قد تستخدم 2–3 Worktrees مستقلة. الـPatch Conflict Detector يمنع دمج hunks المتداخلة؛ الـpatches المستقلة تمر Integration Build/Test ثم Post-merge Verification. إذا تعارضت البدائل، يختار النظام أعلى Lane متحقق بدل مزجها تلقائيًا. Cloud mutations تبقى خلف Human Approval.</div>
        </div>}
        {tab==='evaluation' && <div className="settings-section intelligence-section">
          <div className="model-manager-hero"><div><h3>Agent Test Lab v2.5</h3><p>Benchmarks محلية للوكلاء والـPlanner والأدوات والحماية، مع Regression Baseline وRelease Gate.</p></div><button className="primary" onClick={()=>onRefreshEvaluations?.()}><RefreshCw size={14}/> تحديث</button></div>
          <div className="intel-grid intelligence-stats"><div><small>Release Gate</small><b>{evaluationInfo?.lastRun?.releaseGate?.status||'NOT RUN'}</b></div><div><small>Score</small><b>{evaluationInfo?.lastRun?.score!=null?`${evaluationInfo.lastRun.score}%`:'—'}</b></div><div><small>Baseline</small><b>{evaluationInfo?.baseline?`${evaluationInfo.baseline.score}%`:'—'}</b></div><div><small>Runs</small><b>{evaluationInfo?.recentRuns?.length||0}</b></div></div>
          <div className="settings-grid"><label className="toggle-row"><span>Release Evaluation Gate</span><input type="checkbox" checked={draft.evaluationReleaseGateEnabled!==false} onChange={e=>set('evaluationReleaseGateEnabled',e.target.checked)}/></label><label><span>Regression threshold (points)</span><input type="number" min="1" max="50" value={draft.evaluationRegressionThreshold||8} onChange={e=>set('evaluationRegressionThreshold',Math.max(1,Math.min(50,Number(e.target.value||8))))}/></label><label className="toggle-row"><span>Live Model Probes افتراضيًا</span><input type="checkbox" checked={Boolean(draft.evaluationLiveModelProbes)} onChange={e=>set('evaluationLiveModelProbes',e.target.checked)}/></label></div>
          <div className="settings-actions"><button className="primary" disabled={evaluationBusy} onClick={()=>onRunEvaluation?.(Boolean(draft.evaluationLiveModelProbes))}>{evaluationBusy?<Loader2 className="spin" size={14}/>:<TestTube2 size={14}/>} Release Suite</button><button disabled={evaluationBusy} onClick={()=>onRunEvaluation?.(true)}><BrainCircuit size={14}/> Live Model Probes</button><button disabled={!evaluationInfo?.lastRun||evaluationInfo?.lastRun?.releaseGate?.status==='BLOCK'} onClick={()=>onPromoteEvaluationBaseline?.()}><GitCommit size={14}/> Promote Baseline</button><button onClick={async()=>{await onSave?.(draft);await onRefreshEvaluations?.();}}><Save size={14}/> حفظ</button></div>
          <div className="resource-decisions"><b>Suites</b>{(evaluationInfo?.lastRun?.suites||[]).map((x,i)=><div className="resource-decision" key={x.id||i}><div><strong>{x.id}</strong><small>{x.passed}/{x.total} · {x.critical?'CRITICAL':'NON-BLOCKING'}</small></div><span>{x.score}%</span></div>)}{!evaluationInfo?.lastRun&&<small>شغّل Release Suite لإنشاء أول تقرير.</small>}</div>
          <div className="release-note">تعديل الـBaseline يحتاج زرًا صريحًا من الواجهة. API يستطيع تشغيل Evaluation وقراءة النتائج، لكنه لا يستطيع Promote Baseline. Live Model Probes اختيارية لأنها تستخدم Ollama فعليًا وقد تستغرق وقتًا.</div>
        </div>}
        {tab==='performance' && <div className="settings-section performance-section">
          <div className="resource-hero"><div><h3>Resource Governor</h3><p>يقرر Context وحمل النماذج قبل الإرسال، ويسلسل النماذج الثقيلة لتقليل OOM بدل انتظار الانهيار.</p></div><button className="primary" onClick={()=>onRefreshResources?.()}><RefreshCw size={14}/> تحديث الموارد</button></div>
          <div className="resource-grid">
            <div><small>RAM Free</small><b>{humanBytes(resourceInfo?.ram?.freeBytes)}</b><span>{resourceInfo?.ram?.pressure!=null?`${(resourceInfo.ram.pressure*100).toFixed(0)}% used`:'—'}</span></div>
            <div><small>CPU Load</small><b>{resourceInfo?.cpu?.normalizedLoad!=null?`${(resourceInfo.cpu.normalizedLoad*100).toFixed(0)}%`:'—'}</b><span>{resourceInfo?.cpu?.cores||'—'} cores</span></div>
            <div><small>VRAM</small><b>{humanBytes(resourceInfo?.gpu?.maxTotalBytes)}</b><span>{resourceInfo?.gpu?.maxFreeBytes?`${humanBytes(resourceInfo.gpu.maxFreeBytes)} free`:(resourceInfo?.gpu?.devices?.[0]?.name||'Not detected')}</span></div>
            <div><small>Model Queue</small><b>{resourceInfo?.queue?.pending||0}</b><span>{resourceInfo?.queue?.active||0} active · {resourceInfo?.queue?.activeHeavy||0} heavy</span></div>
            <div><small>OOM Cooldown</small><b>{resourceInfo?.oomCooldowns?.length||0}</b><span>5 min adaptive context</span></div>
          </div>
          <div className="settings-grid resource-settings-grid">
            <label className="toggle-line"><input type="checkbox" checked={draft.resourceGovernorEnabled!==false} onChange={e=>set('resourceGovernorEnabled',e.target.checked)}/><span>Resource Governor</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.resourceAutoContext!==false} onChange={e=>set('resourceAutoContext',e.target.checked)}/><span>Dynamic Context</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.resourceAutoFallback!==false} onChange={e=>set('resourceAutoFallback',e.target.checked)}/><span>Preflight Auto Fallback</span></label>
            <label><span>Max concurrent model calls</span><input type="number" min="1" max="4" value={draft.resourceMaxConcurrentModels||2} onChange={e=>set('resourceMaxConcurrentModels',Number(e.target.value||2))}/></label>
            <label><span>RAM reserve (GB)</span><input type="number" min="2" max="32" value={draft.resourceRamReserveGb||4} onChange={e=>set('resourceRamReserveGb',Number(e.target.value||4))}/></label>
            <label><span>Pressure threshold</span><input type="number" min="0.65" max="0.95" step="0.01" value={draft.resourcePressureThreshold||0.82} onChange={e=>set('resourcePressureThreshold',Number(e.target.value||0.82))}/></label>
          </div>
          <div className="resource-decisions"><b>Recent decisions</b>{(resourceInfo?.recentDecisions||[]).slice(0,8).map((d,i)=><div className={`resource-decision ${d.blocked?'blocked':''}`} key={`${d.at}-${i}`}><div><strong>{d.model}</strong><small>{d.kind} · ctx {d.contextWindow} · {d.queueClass}</small></div><span>{d.blocked?'BLOCKED':'ALLOW'}</span><p>{d.reason}</p></div>)}{!(resourceInfo?.recentDecisions||[]).length&&<small>أرسل مهمة أو اضغط تحديث الموارد لبدء سجل القرارات.</small>}</div>
          <div className="settings-actions"><button className="primary" onClick={async()=>{await onSave?.(draft);await onRefreshResources?.();}}><Save size={14}/> حفظ وتطبيق</button></div>
          <div className="release-note">التقديرات وقائية وليست قياسًا دقيقًا لاستهلاك KV Cache. عند ضغط الذاكرة، النظام يخفض num_ctx أو ينتقل لنموذج أخف قبل الإرسال. لا يحذف أي Model.</div>
        </div>}
        {tab==='runtime' && <div className="settings-section runtime-section">
          <div className="runtime-hero"><div><h3>Background Runtime + Recovery Guard</h3><p>Scheduler والـWorkflow والـAPI تستمر في الـTray، ومع Crash Guard يتم حفظ Heartbeat وCheckpoints واستعادة الـSession بعد الانقطاع.</p></div><button className="primary" onClick={()=>onRuntimeRefresh?.()} disabled={runtimeBusy}>{runtimeBusy?<Loader2 className="spin" size={14}/>:<RefreshCw size={14}/>} تحديث الحالة</button></div>
          {recoveryInfo?.safeMode&&<div className="safe-mode-banner"><ShieldAlert size={18}/><div><b>SAFE MODE</b><span>تم رصد Crash loop. Scheduler موقوف مؤقتًا؛ راجع Crash Reports ثم شغّله يدويًا.</span></div></div>}
          <div className="runtime-status-grid">
            <div><small>Tray</small><b>{runtimeInfo?.trayActive?'ACTIVE':'OFF'}</b><span>PID {runtimeInfo?.pid||'—'}</span></div>
            <div><small>Scheduler</small><b>{runtimeInfo?.schedulerRunning?'RUNNING':'PAUSED'}</b><span>{runtimeInfo?.automations?.enabled||0} enabled</span></div>
            <div><small>Recovery</small><b>{recoveryInfo?.safeMode?'SAFE MODE':'READY'}</b><span>{recoveryInfo?.recoveries||0} recovered sessions</span></div>
            <div><small>Watchdog</small><b>{recoveryInfo?.rendererRestarts||0}</b><span>{recoveryInfo?.workerFailures||0} worker failures</span></div>
            <div><small>Windows Startup</small><b>{runtimeInfo?.startupEnabled?'ENABLED':'DISABLED'}</b><span>{runtimeInfo?.backgroundRequested?'Background boot':'Normal session'}</span></div>
            <div><small>Queue</small><b>{runtimeInfo?.automations?.queued||0}</b><span>{runtimeInfo?.automations?.waitingApproval||0} approval</span></div>
            <div><small>Main crashes / 5m</small><b>{recoveryInfo?.crashCount5m||0}</b><span>{recoveryInfo?.previousUnclean?'Previous unclean exit':'Session clean'}</span></div>
            <div><small>Renderer crashes / 5m</small><b>{recoveryInfo?.rendererCrashCount5m||0}</b><span>Max 3 auto restarts</span></div>
          </div>
          <div className="settings-grid runtime-settings-grid">
            <label className="toggle-line"><input type="checkbox" checked={draft.backgroundMode!==false} onChange={e=>set('backgroundMode',e.target.checked)}/><span>Background Mode</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.minimizeToTray!==false} onChange={e=>set('minimizeToTray',e.target.checked)}/><span>إغلاق النافذة إلى System Tray</span></label>
            <label className="toggle-line"><input type="checkbox" checked={Boolean(draft.launchAtStartup)} onChange={e=>set('launchAtStartup',e.target.checked)}/><span>تشغيل مع Windows</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.trayNotifications!==false} onChange={e=>set('trayNotifications',e.target.checked)}/><span>إشعارات Background</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.crashRecovery!==false} onChange={e=>set('crashRecovery',e.target.checked)}/><span>Main-process Crash Recovery</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.rendererAutoRecover!==false} onChange={e=>set('rendererAutoRecover',e.target.checked)}/><span>Renderer Watchdog Auto-Restart</span></label>
            <label className="toggle-line"><input type="checkbox" checked={draft.sessionRestore!==false} onChange={e=>set('sessionRestore',e.target.checked)}/><span>استعادة Workspace والتبويب والنافذة</span></label>
          </div>
          <div className="runtime-actions"><button className="primary" onClick={async()=>{await onSave?.(draft);await onRuntimeRefresh?.();}} disabled={runtimeBusy}><Save size={14}/> حفظ وتطبيق</button>{runtimeInfo?.schedulerRunning?<button onClick={()=>onRuntimeAction?.('pause')} disabled={runtimeBusy}><PauseCircle size={14}/> Pause Scheduler</button>:<button onClick={()=>onRuntimeAction?.('resume')} disabled={runtimeBusy}><PlayCircle size={14}/> Resume Scheduler</button>}<button onClick={()=>onRuntimeAction?.('logs')} disabled={runtimeBusy}><FileSearch size={14}/> Runtime Logs</button><button onClick={()=>onRuntimeAction?.('crashes')} disabled={runtimeBusy}><ShieldAlert size={14}/> Crash Reports</button><button onClick={()=>onRuntimeAction?.('clear-session')} disabled={runtimeBusy}><Eraser size={14}/> Clear UI Session</button></div>
          <div className="release-note">Crash Guard يعيد تشغيل الـMain process بحدود تمنع Crash loop، والـRenderer Watchdog يعيد الواجهة بحد أقصى 3 مرات خلال 5 دقائق. SAFE MODE لا ينفذ Scheduler تلقائيًا. Cloud Push/Deploy/DB Push يظل خلف Approval Gate دائمًا.</div>
        </div>}
        {tab==='integrations' && <div className="settings-section integration-section">
          <div className="integration-hero"><div><h3>Integration Hub · Approval Gate</h3><p>Read-only مباشرة. أي Push / PR / Deploy / DB Push يبدأ Preview ثم ينتظر موافقة صريحة منك.</p></div><button className="primary" onClick={()=>onRefreshIntegrations?.(true)} disabled={integrationBusy}>{integrationBusy?<Loader2 className="spin" size={14}/>:<RefreshCw size={14}/>} فحص الاتصال</button></div>
          <div className="approval-policy"><ShieldCheck size={18}/><div><b>Human approval is mandatory</b><small>الـAgent يقدر ينشئ Proposal فقط. Approval ticket قصير العمر وSingle-use، ويتلغي إذا تغيّر الـWorkspace بعد المعاينة.</small></div></div>
          <div className="integration-grid">{(integrationStatus?.providers||[]).map(p=><div className={`integration-card ${p.installed?'installed':''}`} key={p.provider}><div className="integration-card-head"><div className="integration-provider-icon">{p.provider==='github'?<GitBranch size={19}/>:p.provider==='vercel'?<Globe2 size={19}/>:<Database size={19}/>}</div><div><b>{p.label}</b><small>{p.version||'CLI غير موجود'}</small></div><span className={`integration-state ${p.authenticated===true?'ok':p.installed?'warn':'bad'}`}>{!p.installed?'NOT INSTALLED':p.authenticated===true?'AUTH OK':p.authenticated===false?'AUTH NEEDED':'INSTALLED'}</span></div><div className="integration-actions">{p.provider==='github'&&<><button disabled={!p.installed||integrationBusy} onClick={()=>onIntegrationQuery?.('github','auth')}>Auth</button><button disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationQuery?.('github','repo')}>Repo</button><button disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationQuery?.('github','prs')}>PRs</button><button className="write-action" disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationPropose?.('github','push_current')}>Preview Push</button></>}{p.provider==='vercel'&&<><button disabled={!p.installed||integrationBusy} onClick={()=>onIntegrationQuery?.('vercel','whoami')}>Whoami</button><button disabled={!p.installed||integrationBusy} onClick={()=>onIntegrationQuery?.('vercel','projects')}>Projects</button><button className="write-action" disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationPropose?.('vercel','deploy_preview')}>Preview Deploy</button><button className="write-action high" disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationPropose?.('vercel','deploy_production')}>Production Deploy</button></>}{p.provider==='supabase'&&<><button disabled={!p.installed||integrationBusy} onClick={()=>onIntegrationQuery?.('supabase','projects')}>Projects</button><button disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationQuery?.('supabase','local_status')}>Local Status</button><button className="write-action high" disabled={!p.installed||!workspace||integrationBusy} onClick={()=>onIntegrationPropose?.('supabase','db_push')}>DB Push Dry-run</button></>}</div>{p.provider==='github'&&<div className="pr-form"><input value={prTitle} onChange={e=>setPrTitle(e.target.value)} placeholder="PR title"/><input value={prBase} onChange={e=>setPrBase(e.target.value)} placeholder="Base branch (اختياري)"/><button className="write-action" disabled={!p.installed||!workspace||integrationBusy||!prTitle.trim()} onClick={async()=>{const r=await onIntegrationPropose?.('github','pr_create',{title:prTitle,base:prBase});if(r?.success)setPrTitle('');}}>Preview PR</button></div>}</div>)}</div>
          <div className="approval-queue"><div className="approval-queue-head"><b>Pending approvals</b><span>{integrationApprovals?.length||0}</span></div>{(integrationApprovals||[]).map(ap=><div className={`approval-card risk-${ap.risk||'medium'}`} key={ap.id}><div className="approval-card-head"><div><b>{ap.provider} · {ap.label||ap.action}</b><small>{ap.workspace||'—'}</small></div><span>{String(ap.risk||'medium').toUpperCase()}</span></div><code>{ap.command}</code><div className="approval-effects">{(ap.effects||[]).map((x,i)=><small key={i}>• {x}</small>)}{(ap.warnings||[]).map((x,i)=><small className="warn-text" key={`w-${i}`}>⚠ {x}</small>)}</div>{ap.preflight&&<details><summary>Preflight evidence</summary><pre>{JSON.stringify(ap.preflight,null,2)}</pre></details>}<div className="approval-actions"><button onClick={()=>onIntegrationReject?.(ap.id)} disabled={integrationBusy}><X size={13}/> رفض</button><button className="approve" onClick={()=>onIntegrationApprove?.(ap.id)} disabled={integrationBusy}><ShieldCheck size={13}/> موافقة وتنفيذ</button></div><small>ينتهي: {ap.expiresAt?new Date(ap.expiresAt).toLocaleTimeString():'—'}</small></div>)}{!(integrationApprovals||[]).length&&<div className="empty-state"><ShieldCheck size={23}/><b>لا توجد عمليات بانتظار الموافقة</b><p>أي Cloud mutation ستظهر هنا قبل التنفيذ.</p></div>}</div>
          <div className="integration-result"><b>آخر نتيجة</b>{integrationResult?<pre>{JSON.stringify(integrationResult.data ?? integrationResult.execution ?? integrationResult.proposal ?? {success:integrationResult.success,provider:integrationResult.provider,action:integrationResult.action,stdout:integrationResult.stdout,stderr:integrationResult.stderr,error:integrationResult.error},null,2)}</pre>:<small>شغّل Query أو أنشئ Proposal لعرض النتيجة هنا.</small>}</div>
          <div className="audit-list"><b>Audit Log</b>{(integrationAudit||[]).slice(0,16).map((x,i)=><div className="audit-row" key={`${x.at}-${i}`}><span>{x.provider||'system'} · {x.action||x.kind}</span><small>{x.at?new Date(x.at).toLocaleString():'—'} · {x.status||x.kind||''}</small><b className={x.success===false?'bad-text':'ok-text'}>{x.success===false?'FAIL':'LOG'}</b></div>)}{!(integrationAudit||[]).length&&<small>ما فيه عمليات مسجلة حتى الآن.</small>}</div>
          <div className="release-note">Credentials لا تُخزّن داخل ABDULKAREM AI X. التنفيذ يستخدم جلسات CLI الرسمية. لا توجد أوامر Delete/Reset/Force Push في Allow-list الحالية، والـAgent لا يمتلك أداة Approve.</div>
        </div>}
        {tab==='health' && <div className="settings-section">
          <div className="health-hero"><div className={`health-score ${health>=80?'ok':health==null?'':'warn'}`}>{diagnosticsBusy?<Loader2 className="spin" size={24}/>:<>{health??'—'}<small>%</small></>}</div><div><h3>System Health</h3><p>يفحص Ollama والنماذج وPython وGit والـAPI وMCP وKnowledge DB.</p></div></div>
          <div className="health-checks">{diagnostics?.checks?.map(c=><div className={`health-row ${c.ok?'ok':'bad'}`} key={c.id}><span>{c.ok?<CheckCircle2 size={15}/>:<ShieldAlert size={15}/>}<b>{c.label}</b></span><code>{c.detail||'—'}</code></div>)||<div className="empty-state"><Activity size={25}/><b>شغّل Diagnostics</b></div>}</div>
          <div className="settings-actions"><button className="primary" onClick={onDiagnostics} disabled={diagnosticsBusy}><Activity size={14}/> فحص الآن</button><button onClick={onExportDiagnostics} disabled={diagnosticsBusy}><Download size={14}/> تصدير التقرير</button></div>
        </div>}
        {tab==='backup' && <div className="settings-section">
          <div className="backup-head"><div><h3>Backup & Restore</h3><p>يحفظ Settings وMCP وKnowledge/Memory DB وWorkflow Checkpoints وAutomation Schedules/History وIntegration Audit وAPI configuration والـSkills الشخصية.</p></div><button className="primary" onClick={onBackup} disabled={backupBusy}>{backupBusy?<Loader2 className="spin" size={14}/>:<Archive size={14}/>} إنشاء Backup</button></div>
          <div className="backup-list">{backups?.length?backups.map(b=><div className="backup-row" key={b.path}><div><b>{b.name}</b><small>{humanBytes(b.size)} · {new Date(b.modifiedAt).toLocaleString()}</small></div><button onClick={()=>onRestore?.(b.path)}><Upload size={13}/> Restore</button></div>):<div className="empty-state"><Archive size={25}/><b>ما فيه نسخ احتياطية حتى الآن</b></div>}</div>
          <div className="settings-actions"><button onClick={onOpenBackupFolder}><FolderOpen size={14}/> فتح مجلد النسخ</button><button onClick={()=>onRestore?.('')}><Upload size={14}/> اختيار Backup خارجي</button></div>
        </div>}
        {tab==='update' && <div className="settings-section"><h3>Updates</h3><div className="update-card"><PackageCheck size={28}/><div><b>الإصدار الحالي 2.5.1</b><p>{updateInfo?.configured ? (updateInfo.available?`يتوفر ${updateInfo.latest}`:'أنت على الإصدار الحالي أو تعذر تحديد إصدار أحدث.') : 'التحديث التلقائي غير مربوط بخادم إصدار حتى الآن. استخدم ZIP أو Windows Installer للتحديث.'}</p>{updateInfo?.notes&&<small>{updateInfo.notes}</small>}</div></div><div className="release-note">التحديث لا يحذف نماذج Ollama. بيانات التطبيق تبقى في userData ويمكن حمايتها بـBackup قبل أي ترقية.</div></div>}
      </div>
    </div>
  </div></div>;
}

function FormattedText({ text }) {
  const blocks = String(text || '').split(/```/g);
  return <>{blocks.map((block, i) => i % 2 ? <pre className="code-block" key={i}>{block.replace(/^\w+\n/, '')}</pre> : <div className="text-block" key={i}>{block.split('\n').map((line, j) => <React.Fragment key={j}>{line}<br/></React.Fragment>)}</div>)}</>;
}

function DesktopRuntimeRequired() {
  return <div className="desktop-runtime-required" dir="rtl">
    <div className="desktop-runtime-card">
      <ShieldAlert size={34}/>
      <h1>ABDULKAREM AI X</h1>
      <h2>Desktop Runtime Required</h2>
      <p>هذه الواجهة تعتمد على Electron Preload ولا تعمل كصفحة ويب مستقلة.</p>
      <code>شغّل START-WINDOWS.bat أو INSTALL-AND-START.bat</code>
      <small>Web Preview compatibility guard نشط — لن تظهر صفحة بيضاء أو خطأ window.abdx.</small>
    </div>
  </div>;
}

const rootElement = document.getElementById('root');
createRoot(rootElement).render(window.abdx ? <App /> : <DesktopRuntimeRequired />);
