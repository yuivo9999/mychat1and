import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  RefreshCw, 
  ExternalLink, 
  Smartphone, 
  Terminal, 
  Folder, 
  ChevronDown, 
  Play, 
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Code
} from 'lucide-react';
import { Workspace } from '../types/workspace';
import {
  ProjectRuntimeState,
  ProjectRuntimeHealth,
  checkProjectRuntimeHealth,
  getProjectRuntimeState,
  startProjectRuntime,
  stopProjectRuntime,
  getNodeDependencyState,
  installProjectDependencies,
  buildProjectStartCommand,
} from '../services/projectRuntimeService';
import { 
  generatePreviewHtml, 
  detectWorkspaceRunnableType, 
  scaffoldSampleReactProject 
} from '../services/workspacePreviewEngine';

interface WorkspacePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  initialWorkspaceId?: string;
  onSaveWorkspace?: (workspace: Workspace) => Promise<void>; onRequestAgentAudit?: (workspaceId:string)=>void;
}

interface ConsoleLogItem {
  id: string;
  type: 'log' | 'warn' | 'error';
  message: string;
  time: string;
}

export const WorkspacePreviewModal: React.FC<WorkspacePreviewModalProps> = ({
  isOpen,
  onClose,
  workspaces,
  initialWorkspaceId,
  onSaveWorkspace, onRequestAgentAudit,
}) => {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialWorkspaceId || workspaces[0]?.id || ''
  );
  const [zoom,setZoom]=useState(100); const [shell,setShell]=useState(true); const [inspect,setInspect]=useState(false); const [tab,setTab]=useState<'ai'|'interaction'|'a11y'|'compare'>('ai'); const [before,setBefore]=useState<string|null>(null); const [after,setAfter]=useState<string|null>(null); const [result,setResult]=useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [runtimeState, setRuntimeState] = useState<ProjectRuntimeState>({ supported: false, running: false, status: 'unknown' });
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<'static' | 'live'>('static');
  const [runtimeHealth, setRuntimeHealth] = useState<ProjectRuntimeHealth>({ ok: false });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shot=()=>{if(!activeWorkspace)return;try{const raw=(window as any).MyChatAndroid?.captureProjectRuntimeScreenshot?.(activeWorkspace.id,72,'mobile');const p=typeof raw==='string'?JSON.parse(raw):raw;if(p?.dataUrl){setBefore(after);setAfter(p.dataUrl);setInspect(true);setTab('compare');setResult(['手机 390×780 真实预览截图已更新。']);}}catch(e:any){setResult([e?.message||String(e)]);setInspect(true);}};
  const a11y=()=>{try{const d=iframeRef.current?.contentDocument;if(!d)throw Error('实时项目跨源，无法读取 DOM');const x:string[]=[];d.querySelectorAll('img').forEach((e:any)=>{if(!e.alt)x.push('图片缺少 alt')});d.querySelectorAll('button').forEach((e:any)=>{if(!(e.innerText||e.getAttribute('aria-label')||e.title))x.push('按钮缺少可访问名称')});setResult(x.length?x.slice(0,10):['未发现明显 Accessibility 问题']);setTab('a11y');setInspect(true)}catch(e:any){setResult([e.message||String(e)]);setTab('a11y');setInspect(true)}};
  const interaction=()=>{try{const d=iframeRef.current?.contentDocument;if(!d)throw Error('实时项目跨源，无法执行 DOM 交互测试');const es=[...d.querySelectorAll('button,a,input,select,textarea')];let n=0;es.slice(0,8).forEach((e:any)=>{e.focus();if(d.activeElement===e)n++});setResult([`发现 ${es.length} 个交互元素`,`前 ${Math.min(8,es.length)} 个元素成功 focus：${n} 个`]);setTab('interaction');setInspect(true)}catch(e:any){setResult([e.message||String(e)]);setTab('interaction');setInspect(true)}};
  const fix=()=>{if(consoleLogs.some(l=>l.type==='error'))onRequestAgentAudit?.(activeWorkspace?.id||'');else{setResult(['当前没有 Console Error']);setInspect(true);}};


  const refreshRuntimeState = () => {
    if (!activeWorkspace) return;
    const state = getProjectRuntimeState(activeWorkspace.id);
    setRuntimeState(state);
    if (state.running && state.port) setRuntimeMode('live');
  };

  // Sync selected workspace if initialWorkspaceId changes
  useEffect(() => {
    if (initialWorkspaceId) {
      setSelectedWorkspaceId(initialWorkspaceId);
    } else if (workspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [initialWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0] || null;
  }, [workspaces, selectedWorkspaceId]);

  const runnableInfo = useMemo(() => {
    return detectWorkspaceRunnableType(activeWorkspace);
  }, [activeWorkspace]);

  // Generate preview HTML
  const previewHtml = useMemo(() => {
    return generatePreviewHtml(activeWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, refreshKey]);

  // Listen to console messages from preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === 'workspace-preview-console') {
        const item: ConsoleLogItem = {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: event.data.type || 'log',
          message: event.data.message || '',
          time: event.data.time || new Date().toLocaleTimeString(),
        };
        setConsoleLogs(prev => [item, ...prev].slice(0, 80));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!activeWorkspace) return;
    setRuntimeState(getProjectRuntimeState(activeWorkspace.id));
    setRuntimeMode('static');
    const timer = window.setInterval(() => {
      const state = getProjectRuntimeState(activeWorkspace.id);
      setRuntimeState(state);
      if (state.running && state.port) setRuntimeMode('live');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkspace?.id, refreshKey]);

  useEffect(() => {
    if (!isOpen && activeWorkspace?.id) stopProjectRuntime(activeWorkspace.id);
  }, [isOpen, activeWorkspace?.id]);

  const handleStartRuntime = () => {
    if (!activeWorkspace || runtimeBusy) return;
    setRuntimeBusy(true);
    try {
      const command = buildProjectStartCommand(activeWorkspace);
      if (!command) {
        setRuntimeState({ supported: false, running: false, status: 'unknown', stderr: '当前项目没有可识别的 Node Web 启动脚本；已保留静态预览。' });
        return;
      }
      const deps = getNodeDependencyState(activeWorkspace.id);
      if (!deps.inSync) {
        const install = installProjectDependencies(activeWorkspace.id);
        if (!install.success) {
          setRuntimeState({ supported: true, running: false, status: 'error', command, stderr: install.stderr || install.error || '依赖安装失败' });
          return;
        }
      }
      const state = startProjectRuntime(activeWorkspace);
      setRuntimeState(state);
      if (state.port) setRuntimeMode('live');
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleCheckRuntime = () => {
    if (!runtimeState.port) return;
    const health = checkProjectRuntimeHealth(runtimeState.port, 1500);
    setRuntimeHealth(health);
    if (!health.ok) {
      setRuntimeState(prev => ({
        ...prev,
        status: prev.running ? 'error' : prev.status,
        stderr: health.error || prev.stderr,
      }));
    }
  };

  const handleRestartRuntime = () => {
    if (!activeWorkspace || runtimeBusy) return;
    setRuntimeBusy(true);
    try {
      stopProjectRuntime(activeWorkspace.id);
      setRuntimeHealth({ ok: false });
      const state = startProjectRuntime(activeWorkspace);
      setRuntimeState(state);
      if (state.port) {
        setRuntimeMode('live');
        window.setTimeout(handleCheckRuntime, 250);
      }
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleStopRuntime = () => {
    if (!activeWorkspace) return;
    stopProjectRuntime(activeWorkspace.id);
    setRuntimeState({ supported: true, running: false, status: 'stopped' });
    setRuntimeMode('static');
  };

  // Handle refresh
  const handleRefresh = () => {
    setConsoleLogs([]);
    setRefreshKey(prev => prev + 1);
  };

  // Handle open in new browser tab via Blob URL
  const handleOpenInNewTab = () => {
    try {
      const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert('无法打开新窗口，请检查浏览器弹窗拦截设置');
    }
  };

  // One-click scaffold sample React project
  const handleScaffoldSample = async () => {
    if (!activeWorkspace) return;
    const updated = scaffoldSampleReactProject(activeWorkspace);
    if (onSaveWorkspace) {
      await onSaveWorkspace(updated);
    }
    setRefreshKey(prev => prev + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 select-none animate-in fade-in duration-200">
      <div 
        className="w-full max-w-6xl h-[92vh] max-h-[900px] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="px-3 sm:px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Left: Title & Workspace Switcher */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-sm text-neutral-900 dark:text-neutral-100 shrink-0">
              <span className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-2xs">
                <Play className="w-3 h-3 fill-current ml-0.5" />
              </span>
              <span>项目预览区</span>
            </div>

            <div className="h-4 w-[1px] bg-neutral-200 dark:bg-neutral-700 hidden sm:block" />

            {/* Workspace Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 shadow-2xs transition"
                title="切换当前预览的工作区"
              >
                <Folder className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-[180px]">
                  {activeWorkspace?.name || '请选择工作区'}
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>

              {isWorkspaceMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setIsWorkspaceMenuOpen(false)} 
                  />
                  <div className="absolute left-0 top-8 w-56 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 z-40 text-xs max-h-60 overflow-y-auto">
                    <div className="px-3 py-1 font-semibold text-[10px] text-neutral-400 uppercase tracking-wider">
                      选择要预览的工作区
                    </div>
                    {workspaces.map(ws => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkspaceId(ws.id);
                          setIsWorkspaceMenuOpen(false);
                          setRefreshKey(prev => prev + 1);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700/60 transition ${
                          ws.id === selectedWorkspaceId 
                            ? 'text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50/50 dark:bg-indigo-950/30' 
                            : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono ml-2 shrink-0">
                          {Object.keys(ws.files).length} 文件
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Entry point badge */}
            {runnableInfo.hasRunnableEntry ? (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>入口: {runnableInfo.entryPath}</span>
              </span>
            ) : (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                <AlertTriangle className="w-3 h-3" />
                <span>无标准网页入口</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-neutral-800 p-0.5 rounded-xl text-xs"><Smartphone className="w-3.5 h-3.5"/><span>手机 390×780</span><select value={zoom} onChange={e=>setZoom(+e.target.value)} className="bg-transparent ml-2">{[50,67,80,90,100,110,125,150].map(v=><option key={v} value={v}>{v}%</option>)}</select><button onClick={()=>setZoom(100)}>适配</button><button onClick={()=>setShell(!shell)}>{shell?'外壳':'无外壳'}</button><button onClick={()=>{setTab('ai');setInspect(true)}}>✨ AI检查</button><button onClick={interaction}>交互</button><button onClick={a11y}>无障碍</button><button onClick={shot}>截图</button><button onClick={fix}>修复错误</button></div>
          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            {!runnableInfo.hasRunnableEntry && (
              <button
                type="button"
                onClick={handleScaffoldSample}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-300 text-xs font-medium border border-indigo-200 dark:border-indigo-800 transition"
                title="一键植入标准的 React 示例项目用于测试"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>植入 React 示例模版</span>
              </button>
            )}

            {runtimeState.supported && !!activeWorkspace && !!buildProjectStartCommand(activeWorkspace) && (
              <>
                {runtimeState.running && runtimeState.port && (
                  <button
                    type="button"
                    onClick={handleCheckRuntime}
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
                    title="检查本机运行服务是否正常响应"
                  >
                    <span className={`w-2 h-2 rounded-full ${runtimeHealth.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {runtimeHealth.ok ? `正常 · ${runtimeHealth.latencyMs || 0}ms` : '检查运行状态'}
                  </button>
                )}
                {runtimeState.running ? (
                  <>
                    <button type="button" onClick={handleRestartRuntime} disabled={runtimeBusy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-medium disabled:opacity-50" title="停止并重新启动真实项目">
                      <RefreshCw className="w-3 h-3" />重启
                    </button>
                    <button type="button" onClick={handleStopRuntime} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-medium" title="停止真实项目进程">
                      <span className="w-2 h-2 rounded-full bg-red-500" />停止运行
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={handleStartRuntime} disabled={runtimeBusy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium disabled:opacity-50" title="安装依赖并启动真实项目">
                    <Play className="w-3 h-3 fill-current" />{runtimeBusy ? '启动中…' : '运行项目'}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-xl transition"
              title="刷新重新渲染"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-xl transition"
              title="在新标签页独立打开运行"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowConsole(!showConsole)}
              className={`p-1.5 rounded-xl transition relative ${
                showConsole 
                  ? 'bg-neutral-800 text-white dark:bg-neutral-700' 
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
              }`}
              title="查看网页运行控制台"
            >
              <Terminal className="w-4 h-4" />
              {consoleLogs.some(l => l.type === 'error') && (
                <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1 right-1" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-xl transition ml-1"
              title="关闭预览"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-neutral-100 dark:bg-neutral-950 flex items-center justify-center overflow-auto"><div className="relative" style={{transform:'scale('+zoom/100+')'}}>{shell&&<div className="absolute -inset-3 rounded-[2.4rem] bg-neutral-950 shadow-2xl pointer-events-none"><div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-black"/></div>}<div className="relative w-[390px] h-[780px] rounded-[2rem] overflow-hidden bg-white border"><iframe ref={iframeRef} key={selectedWorkspaceId+'_'+refreshKey+'_'+runtimeMode} src={runtimeMode==='live'&&runtimeState.port?'http://127.0.0.1:'+runtimeState.port:undefined} srcDoc={runtimeMode==='live'&&runtimeState.port?undefined:previewHtml} title="Workspace Preview" sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups" className="w-full h-full border-0"/></div></div></div>
        {inspect&&<div className="h-48 border-t bg-white dark:bg-neutral-900 p-2 text-xs overflow-auto"><div className="flex gap-2 mb-2">{['ai','interaction','a11y','compare'].map((x:any)=><button key={x} onClick={()=>setTab(x)}>{x==='ai'?'AI检查':x==='interaction'?'交互':x==='a11y'?'Accessibility':'前后对比'}</button>)}</div>{tab==='ai'&&<><div>{result.length?result.map(x=><div key={x}>• {x}</div>):'AI 将获取真实手机截图并结合代码、Console、运行时证据检查。'}</div><button className="mt-2 px-3 py-1 rounded bg-indigo-600 text-white" onClick={()=>onRequestAgentAudit?.(activeWorkspace?.id||'')}>让 Agent 检查并修复</button></>}{tab==='interaction'&&result.map(x=><div key={x}>• {x}</div>)}{tab==='a11y'&&result.map(x=><div key={x}>• {x}</div>)}{tab==='compare'&&<div className="grid grid-cols-2 gap-2">{before?<img src={before} className="max-h-36 object-contain"/>:<div>暂无上一张</div>}{after?<img src={after} className="max-h-36 object-contain"/>:<div>暂无当前</div>}</div>}</div>}
        {/* Collapsible Console Logs Drawer */}
        {showConsole && (
          <div className="h-44 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-neutral-200 font-mono text-xs flex flex-col shrink-0">
            <div className="px-3 py-1.5 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                <span className="font-semibold text-neutral-300">{runtimeMode === 'live' ? '项目运行控制台' : '浏览器运行控制台 (Console)'}</span>
                {runtimeMode === 'live' && runtimeState.port && <span className="text-[10px] text-emerald-400">LIVE · :{runtimeState.port}</span>}
                <span className="text-[10px] text-neutral-500">
                  ({consoleLogs.length} 条记录)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConsoleLogs([])}
                  className="text-[10px] text-neutral-400 hover:text-white transition"
                >
                  清空日志
                </button>
                <button
                  type="button"
                  onClick={() => setShowConsole(false)}
                  className="text-neutral-400 hover:text-white transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-2 overflow-y-auto space-y-1 select-text">
              {consoleLogs.length === 0 ? (
                <div className="text-neutral-500 text-[11px] p-2 italic">
                  {runtimeMode === 'live' && (runtimeState.stdout || runtimeState.stderr) ? (
                    <pre className="whitespace-pre-wrap break-all text-[11px] text-neutral-300">{runtimeState.stdout}{runtimeState.stderr && `\\n${runtimeState.stderr}`}</pre>
                  ) : (
                    <>暂无控制台日志输出。网页中的 console.log 与运行时报错将实时显示在此处。</>
                  )}
                </div>
              ) : (
                consoleLogs.map(log => (
                  <div 
                    key={log.id} 
                    className={`px-2 py-0.5 rounded text-[11px] flex items-start gap-2 ${
                      log.type === 'error' 
                        ? 'bg-red-950/40 text-red-300 border-l-2 border-red-500' 
                        : log.type === 'warn' 
                          ? 'bg-amber-950/40 text-amber-300 border-l-2 border-amber-500' 
                          : 'text-neutral-300 hover:bg-neutral-800/40'
                    }`}
                  >
                    <span className="text-neutral-500 shrink-0 text-[10px]">{log.time}</span>
                    <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
