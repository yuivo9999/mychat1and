import { Workspace, WorkspaceFile } from '../types/workspace';

export interface WorkspaceRunnableInfo {
  hasRunnableEntry: boolean;
  entryType: 'html' | 'react' | 'none';
  entryPath: string;
  totalFiles: number;
  runnableFiles: string[];
}

// Detect if a workspace has an HTML entry point or a React/JS entry point
export function detectWorkspaceRunnableType(workspace: Workspace | null): WorkspaceRunnableInfo {
  if (!workspace || !workspace.files || Object.keys(workspace.files).length === 0) {
    return {
      hasRunnableEntry: false,
      entryType: 'none',
      entryPath: '',
      totalFiles: 0,
      runnableFiles: [],
    };
  }

  const paths = Object.keys(workspace.files);
  const totalFiles = paths.length;

  // 1. Look for standard HTML entry points
  const htmlEntryCandidates = [
    'index.html',
    'dist/index.html',
    'public/index.html',
    'build/index.html',
  ];

  for (const candidate of htmlEntryCandidates) {
    if (workspace.files[candidate]) {
      return {
        hasRunnableEntry: true,
        entryType: 'html',
        entryPath: candidate,
        totalFiles,
        runnableFiles: paths,
      };
    }
  }

  // Any other .html file at root or in first level
  const anyHtml = paths.find(p => p.endsWith('.html'));
  if (anyHtml) {
    return {
      hasRunnableEntry: true,
      entryType: 'html',
      entryPath: anyHtml,
      totalFiles,
      runnableFiles: paths,
    };
  }

  // 2. Look for React / JSX component entry points
  const reactEntryCandidates = [
    'src/App.tsx',
    'src/App.jsx',
    'src/main.tsx',
    'src/main.jsx',
    'src/index.tsx',
    'src/index.jsx',
    'App.tsx',
    'App.jsx',
    'src/App.js',
    'App.js',
    'src/index.js',
    'index.js',
  ];

  for (const candidate of reactEntryCandidates) {
    if (workspace.files[candidate]) {
      return {
        hasRunnableEntry: true,
        entryType: 'react',
        entryPath: candidate,
        totalFiles,
        runnableFiles: paths,
      };
    }
  }

  return {
    hasRunnableEntry: false,
    entryType: 'none',
    entryPath: '',
    totalFiles,
    runnableFiles: paths,
  };
}

// Normalize relative paths (e.g. "./style.css" -> "style.css", "../src/App.tsx" -> "src/App.tsx")
function normalizeLookupPath(baseDir: string, relativePath: string): string {
  let cleaned = relativePath.split('?')[0].split('#')[0].trim();
  cleaned = cleaned.replace(/^\/+/, ''); // Remove leading slash

  if (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }

  if (baseDir && !cleaned.startsWith(baseDir)) {
    const combined = `${baseDir}/${cleaned}`.replace(/\/{2,}/g, '/');
    return combined;
  }

  return cleaned;
}

// Console bridge script injected into preview iframe to forward errors & logs to parent
const CONSOLE_BRIDGE_SCRIPT = `
<script>
(function() {
  function sendToParent(type, message) {
    try {
      window.parent.postMessage({
        source: 'workspace-preview-console',
        type: type,
        message: typeof message === 'object' ? JSON.stringify(message) : String(message),
        time: new Date().toLocaleTimeString()
      }, '*');
    } catch(e) {}
  }

  var _log = console.log;
  var _warn = console.warn;
  var _error = console.error;

  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    sendToParent('log', args.join(' '));
    _log.apply(console, arguments);
  };

  console.warn = function() {
    var args = Array.prototype.slice.call(arguments);
    sendToParent('warn', args.join(' '));
    _warn.apply(console, arguments);
  };

  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    sendToParent('error', args.join(' '));
    _error.apply(console, arguments);
  };

  window.addEventListener('error', function(e) {
    sendToParent('error', (e.message || '脚本执行错误') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : ''));
  });

  window.addEventListener('unhandledrejection', function(e) {
    sendToParent('error', '未捕获的 Promise 错误: ' + (e.reason && (e.reason.message || e.reason) || '未知异常'));
  });
})();
</script>
`;

// Build a complete, runnable HTML document string for a workspace project
export function generatePreviewHtml(workspace: Workspace | null): string {
  if (!workspace || !workspace.files || Object.keys(workspace.files).length === 0) {
    return generateEmptyStateHtml('当前工作区为空，暂无可运行的网页文件');
  }

  const info = detectWorkspaceRunnableType(workspace);

  if (!info.hasRunnableEntry) {
    return generateGuidanceHtml(workspace);
  }

  if (info.entryType === 'html') {
    return buildHtmlProjectBundle(workspace, info.entryPath);
  }

  if (info.entryType === 'react') {
    return buildReactProjectBundle(workspace, info.entryPath);
  }

  return generateGuidanceHtml(workspace);
}

// Case 1: Build bundle starting from index.html (resolves local CSS, JS, Images)
function buildHtmlProjectBundle(workspace: Workspace, entryPath: string): string {
  const entryFile = workspace.files[entryPath];
  if (!entryFile) {
    return generateEmptyStateHtml(`未找到入口文件 ${entryPath}`);
  }

  let html = entryFile.content;
  const baseDir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/')) : '';

  // 1. Resolve and inline local <link rel="stylesheet" href="...">
  html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      return match; // Keep external CDN links
    }
    const resolvedPath = normalizeLookupPath(baseDir, href);
    const cssFile = workspace.files[resolvedPath] || workspace.files[href.replace(/^\.\//, '')];
    if (cssFile) {
      return `<style data-source="${resolvedPath}">\n${cssFile.content}\n</style>`;
    }
    return match;
  });

  // 2. Resolve local <script src="...">
  html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      return match;
    }
    const resolvedPath = normalizeLookupPath(baseDir, src);
    const jsFile = workspace.files[resolvedPath] || workspace.files[src.replace(/^\.\//, '')];
    if (jsFile) {
      const isTsxOrJsx = resolvedPath.endsWith('.tsx') || resolvedPath.endsWith('.jsx') || resolvedPath.endsWith('.ts');
      const scriptType = isTsxOrJsx ? 'type="text/babel"' : 'type="text/javascript"';
      return `<script ${scriptType} data-source="${resolvedPath}">\n${jsFile.content}\n</script>`;
    }
    return match;
  });

  // 3. Check if Babel is needed (if HTML contains JSX or TSX scripts)
  const needsBabel = html.includes('type="text/babel"') || html.includes('.tsx') || html.includes('.jsx');
  const babelScript = needsBabel
    ? `<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.4/babel.min.js"></script>`
    : '';

  // 4. Inject console bridge and Babel before </head> or <body>
  const injectBlock = `${CONSOLE_BRIDGE_SCRIPT}\n${babelScript}`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${injectBlock}\n</head>`);
  } else if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n${injectBlock}`);
  } else if (html.includes('<body>')) {
    html = html.replace('<body>', `<head>\n${injectBlock}\n</head>\n<body>`);
  } else {
    html = `<!DOCTYPE html>\n<html>\n<head>\n${injectBlock}\n</head>\n<body>\n${html}\n</body>\n</html>`;
  }

  return html;
}

// Case 2: Build bundle for React projects (e.g. src/App.tsx, src/main.tsx)
function buildReactProjectBundle(workspace: Workspace, entryPath: string): string {
  // Collect all files in workspace to expose to virtual module system
  const virtualFiles: Record<string, string> = {};
  for (const [path, file] of Object.entries(workspace.files)) {
    if (!file.isBinary) {
      virtualFiles[path] = file.content;
    }
  }

  // Look for any global CSS (like index.css, style.css, App.css)
  const cssContents: string[] = [];
  const cssCandidates = ['src/index.css', 'src/App.css', 'src/style.css', 'index.css', 'style.css', 'App.css'];
  for (const c of cssCandidates) {
    if (workspace.files[c] && !workspace.files[c].isBinary) {
      cssContents.push(`/* ${c} */\n${workspace.files[c].content}`);
    }
  }

  // Main component file
  const mainFile = workspace.files[entryPath];
  const mainContent = mainFile ? mainFile.content : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OmniChat · 工作区项目预览</title>
  
  <!-- 1. Tailwind CSS CDN for instant styling -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- 2. React 18 & ReactDOM 18 -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  
  <!-- 3. Babel Standalone to compile TypeScript & JSX in browser -->
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.4/babel.min.js"></script>

  <!-- 4. Lucide Icons via Lucide script -->
  <script src="https://unpkg.com/lucide@latest"></script>

  ${CONSOLE_BRIDGE_SCRIPT}

  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #ffffff;
      color: #111827;
      min-height: 100vh;
    }
    ${cssContents.join('\n\n')}
  </style>
</head>
<body>
  <div id="root"></div>

  <!-- Runtime Virtual Module Engine & Component Launcher -->
  <script type="text/babel" data-presets="react,typescript">
    (function() {
      const React = window.React;
      const ReactDOM = window.ReactDOM;

      // Provide virtual workspace files
      const WORKSPACE_FILES = ${JSON.stringify(virtualFiles)};

      // Simple in-browser module resolver
      const moduleCache = {};

      function customRequire(moduleName, currentPath) {
        if (moduleName === 'react') return window.React;
        if (moduleName === 'react-dom' || moduleName === 'react-dom/client') return window.ReactDOM;
        if (moduleName === 'lucide-react') {
          // Provide mock proxy for lucide icons so icons never crash
          return new Proxy({}, {
            get: (target, prop) => {
              return (props) => React.createElement('span', { 
                className: 'inline-flex items-center justify-center ' + (props.className || ''),
                style: { width: props.size || 16, height: props.size || 16, display: 'inline-block' },
                title: String(prop)
              }, '❖');
            }
          });
        }

        // Relative file resolution
        let targetPath = moduleName;
        if (targetPath.startsWith('./') || targetPath.startsWith('../')) {
          const dir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
          targetPath = dir ? (dir + '/' + targetPath.replace(/^\\.\\//, '')) : targetPath.replace(/^\\.\\//, '');
        }

        // Try exact path and extensions (.tsx, .jsx, .ts, .js)
        const extensions = ['', '.tsx', '.jsx', '.ts', '.js', '/index.tsx', '/index.jsx', '/index.js'];
        let matchedFile = null;
        let matchedPath = '';

        for (const ext of extensions) {
          const testPath = targetPath + ext;
          if (WORKSPACE_FILES[testPath]) {
            matchedFile = WORKSPACE_FILES[testPath];
            matchedPath = testPath;
            break;
          }
        }

        if (!matchedFile) {
          console.warn('[预览模块解析] 未找到本地模块: ' + moduleName + ' (解析路径: ' + targetPath + ')');
          return {};
        }

        if (moduleCache[matchedPath]) {
          return moduleCache[matchedPath];
        }

        // Transpile & Execute module
        try {
          const transformed = Babel.transform(matchedFile, {
            presets: ['react', 'typescript'],
            filename: matchedPath,
          }).code;

          const module = { exports: {} };
          const fn = new Function('require', 'module', 'exports', 'React', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', transformed);
          fn((name) => customRequire(name, matchedPath), module, module.exports, React, React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback);
          
          moduleCache[matchedPath] = module.exports;
          return module.exports;
        } catch(err) {
          console.error('[预览执行错误] 编译模块 ' + matchedPath + ' 失败:', err);
          return {};
        }
      }

      // Execute Entry Component
      try {
        const rawCode = ${JSON.stringify(mainContent)};
        const entryPath = ${JSON.stringify(entryPath)};

        // Clean export default or wrap
        const transformedMain = Babel.transform(rawCode, {
          presets: ['react', 'typescript'],
          filename: entryPath,
        }).code;

        const mainModule = { exports: {} };
        const runner = new Function('require', 'module', 'exports', 'React', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', transformedMain);
        runner((name) => customRequire(name, entryPath), mainModule, mainModule.exports, React, React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback);

        const Component = mainModule.exports.default || mainModule.exports.App || Object.values(mainModule.exports)[0];

        if (Component && typeof Component === 'function') {
          const rootElement = document.getElementById('root');
          if (ReactDOM.createRoot) {
            ReactDOM.createRoot(rootElement).render(React.createElement(Component));
          } else {
            ReactDOM.render(React.createElement(Component), rootElement);
          }
          console.log('[预览系统] 项目成功挂载并运行 (' + entryPath + ')');
        } else {
          // Fallback if main.tsx already called createRoot
          console.log('[预览系统] 入口代码执行完毕');
        }
      } catch (err) {
        console.error('[预览运行时异常]', err);
        document.getElementById('root').innerHTML = 
          '<div style="padding: 24px; color: #dc2626; font-family: monospace; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; margin: 20px;">' +
            '<h3 style="margin-top:0; font-weight: bold;">⚠️ 预览项目运行时报错</h3>' +
            '<p style="white-space: pre-wrap; font-size: 13px;">' + err.message + '</p>' +
            '<div style="font-size: 11px; color: #991b1b; margin-top: 12px;">建议检查 ' + ${JSON.stringify(entryPath)} + ' 的语法或导出方式 (export default App)。</div>' +
          '</div>';
      }
    })();
  </script>
</body>
</html>`;
}

// Fallback HTML when workspace has no recognizable runnable web entry
function generateGuidanceHtml(workspace: Workspace): string {
  const filesList = Object.keys(workspace.files).map(p => `<li>${p}</li>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>未检测到可运行的网页项目</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 40px 20px;
      text-align: center;
      background: #fafafa;
      color: #374151;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background: white;
      padding: 32px;
      border-radius: 16px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 4px 16px rgba(0,0,0,0.05);
      text-align: left;
    }
    h2 { font-size: 18px; margin-top: 0; color: #111827; }
    p { font-size: 13px; line-height: 1.6; color: #6b7280; }
    ul { font-size: 12px; font-family: monospace; background: #f3f4f6; padding: 12px 28px; border-radius: 8px; max-height: 160px; overflow-y: auto; }
    .tip { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 14px; font-size: 12px; color: #1e40af; border-radius: 4px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📄 暂未检测到可直接运行的网页入口</h2>
    <p>“预览区”支持直接渲染和运行**完整的静态网页（含有 index.html）**或**现代 React 组件工程（如 src/App.tsx / App.jsx）**。</p>
    <div class="tip">
      💡 <strong>运行要求</strong>：当前工作区【${workspace.name}】包含 ${Object.keys(workspace.files).length} 个文件，但缺少 <code>index.html</code> 或 <code>src/App.tsx</code> 入口。
    </div>
    <p style="margin-top: 18px; font-weight: 600; font-size: 12px;">当前工作区文件列表：</p>
    <ul>
      ${filesList || '<li>(空)</li>'}
    </ul>
    <p style="font-size: 12px; color: #9ca3af; margin-top: 14px;">
      您可以在右侧让 AI 为此工作区生成一个包含 <code>index.html</code> 或 <code>src/App.tsx</code> 的完整页面，随后在此处点击“刷新”即可即刻预览运行！
    </p>
  </div>
</body>
</html>`;
}

function generateEmptyStateHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; color: #6b7280;">
  <div style="text-align: center;">
    <p style="font-size: 14px;">${message}</p>
  </div>
</body>
</html>`;
}

// One-click scaffold a sample runnable React project into the workspace for testing
export function scaffoldSampleReactProject(workspace: Workspace): Workspace {
  const now = Date.now();
  const sampleFiles: Record<string, WorkspaceFile> = {
    'index.html': {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${workspace.name || '我的Web项目'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="./style.css" />
</head>
<body class="bg-gradient-to-br from-slate-50 to-indigo-50 min-h-screen text-slate-800">
  <div id="root"></div>
  <script type="module" src="./src/App.tsx"></script>
</body>
</html>`,
      size: 400,
      updatedAt: now,
    },
    'style.css': {
      path: 'style.css',
      content: `/* 全局样式表 */
body {
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}
.btn-primary {
  transition: all 0.2s ease;
}
.btn-primary:active {
  transform: scale(0.97);
}`,
      size: 160,
      updatedAt: now,
    },
    'src/App.tsx': {
      path: 'src/App.tsx',
      content: `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10">
      <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold">
            ● 正在预览运行
          </span>
          <span className="text-xs text-slate-400 font-mono">React 18 + Tailwind</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
          🎉 恭喜！工作区静态网页已成功运行
        </h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          这是一个运行在浏览器沙箱预览区中的完整 React 交互式项目。您可以在主窗口让 AI 修改或扩展此项目，刷新即刻同步查看！
        </p>

        {/* 交互计数器 */}
        <div className="mt-8 p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">互动测试</div>
            <div className="text-2xl font-black text-indigo-600 mt-1">{count} 次点击</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCount(prev => prev - 1)}
              className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition shadow-sm"
            >
              -
            </button>
            <button
              onClick={() => setCount(prev => prev + 1)}
              className="px-4 h-10 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:scale-95 transition shadow-sm"
            >
              点击累加 +1
            </button>
          </div>
        </div>

        {/* 卡片功能区 */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div 
            onClick={() => setLiked(!liked)}
            className={"p-4 rounded-2xl border cursor-pointer transition select-none " + 
              (liked ? "border-rose-300 bg-rose-50/50 text-rose-700" : "border-slate-200 hover:border-slate-300 bg-white")}
          >
            <div className="text-lg">{liked ? "❤️ 已收藏" : "🤍 点击收藏此项目"}</div>
            <div className="text-xs text-slate-400 mt-1">本地组件实时响应</div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 bg-white">
            <div className="text-sm font-semibold text-slate-800">⚡ 零延迟热重载</div>
            <div className="text-xs text-slate-400 mt-1">AI 每次改动直接同步预览</div>
          </div>
        </div>
      </div>
    </div>
  );
}`,
      size: 2600,
      updatedAt: now,
    },
  };

  return {
    ...workspace,
    files: {
      ...workspace.files,
      ...sampleFiles,
    },
    updatedAt: now,
  };
}
