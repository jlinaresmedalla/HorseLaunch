import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowDown, ChevronDown, Code2, Copy, Filter, FolderOpen, Globe, Play, Search, SearchX, Square, Trash, WrapText, X } from 'lucide-react';
import { ProcessTab, Project } from '../types';
import { JsonViewer, isJsonLine } from './JsonViewer';
import { ProcessTabBar } from './ProcessTabBar';
import { chord, MOD_KEY } from '../utils/platform';
import { TERMINAL_FONT_SIZES, useTheme } from '../contexts/ThemeContext';

const ApiExplorer = lazy(() =>
  import('./ApiExplorer').then(module => ({ default: module.ApiExplorer }))
);

interface ConsoleTabProps {
  tab: ProcessTab;
  project?: Project | null;
  liveGitBranch?: string | null;
  onStop: (processId: string) => void;
  onClose: (processId: string) => void;
  onRerun: (processId: string) => void;
  onClear: (processId: string) => void;
  allTabs: ProcessTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  gitBranches: Record<string, string | null>;
  onOpenInFinder: () => void;
  onOpenInVSCode: () => void;
}

// Detectar líneas de éxito (transversal a todos los lenguajes)
const isSuccessLine = (content: string): boolean => {
  const lowerContent = content.toLowerCase();
  const successPatterns = [
    'build succeeded',
    'compilation succeeded',
    'build successful',
    'exited with code 0',
    '✅',
    'finished successfully',
    'completed successfully'
  ];
  return successPatterns.some(pattern => lowerContent.includes(pattern));
};

// ─── DETECCIÓN ESPECÍFICA PARA RUST ──────────────────────────────────────────
const isRustWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('warning:') || 
         lower.includes('unused import') ||
         lower.includes('unused variable') ||
         lower.includes('unused_') ||
         lower.includes('dead_code') ||
         lower.includes('deprecated') ||
         lower.includes('clippy::') ||
         lower.includes('redundant_') ||
         lower.includes('non_snake_case') ||
         lower.includes('non_camel_case_types') ||
         /-->.*\.rs:\d+:\d+/.test(content);
};

const isRustError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error[') ||      // error[E0432]
         lower.includes('error:') ||
         lower.includes('could not compile') ||
         lower.includes('aborting due to') ||
         lower.includes('mismatched types') ||
         lower.includes('cannot find') ||
         lower.includes('unresolved import') ||
         lower.includes('panic') ||
         lower.includes('thread panicked');
};

const isRustNote = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('note:') || 
         lower.includes('help:') ||
         lower.includes('= note:') ||
         lower.includes('= help:');
};

const isRustLocationLine = (content: string): boolean => {
  return /^\s*-->/.test(content) || /^\s*\d+\s*\|\s*/.test(content);
};

// ─── DETECCIÓN ESPECÍFICA PARA PYTHON ────────────────────────────────────────
const isPythonWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('deprecationwarning') ||
         lower.includes('syntaxwarning') ||
         lower.includes('userwarning') ||
         lower.includes('pendingdeprecationwarning') ||
         lower.includes('runtimewarning') ||
         lower.includes('futurewarning') ||
         lower.includes('importwarning') ||        
         lower.includes(' - warning - ') ||
         lower.includes(': warning:') ||
         lower.includes('[warning]') || 
         (lower.includes('warning') && !lower.includes('error'));
};

const isPythonError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('traceback') ||
         lower.includes('errno') ||
         lower.includes('filenotfounderror') ||
         lower.includes('importerror') ||
         lower.includes('modulenotfounderror') ||
         lower.includes('typeerror') ||
         lower.includes('valueerror') ||
         lower.includes('keyerror') ||
         lower.includes('attributeerror') ||
         lower.includes('syntaxerror') ||
         lower.includes('indentationerror') ||
         lower.includes('nameerror') ||
         lower.includes(' - error - ') ||
         lower.includes(': error:') ||
         lower.includes('[error]');
};

// ─── DETECCIÓN ESPECÍFICA PARA C# / .NET ─────────────────────────────────────
const isCSharpWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('warning cs') ||
         lower.includes('msbuild warning') ||
         lower.includes('warn:') ||
         lower.includes('[warn]') ||
         lower.includes('info:') ||
         lower.includes('[info]') ||
         (lower.includes('warning') && (lower.includes('.cs') || lower.includes('csproj')));
};

const isCSharpError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error cs') ||
         lower.includes('msbuild error') ||
         lower.includes('error:') ||
         lower.includes('error') ||
         lower.includes('[error]') || 
         lower.includes('amazon.s3.amazons3exception') ||
         lower.includes('amazons3exception') ||
         lower.includes('exception') ||
         lower.includes('s3exception') ||
         lower.includes('http error') ||
         (lower.includes('error') && (lower.includes('.cs') || lower.includes('csproj')));
};

// ─── DETECCIÓN ESPECÍFICA PARA REACT / NODE ──────────────────────────────────
const isNodeWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('npm warn') ||
         lower.includes('yarn warn') ||
         lower.includes('deprecated') ||
         (lower.includes('warning') && (lower.includes('node_modules') || lower.includes('package.json'))) ||
         lower.includes('@deprecated');
};

const isNodeError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('npm err') ||
         lower.includes('yarn error') ||
         lower.includes('module not found') ||
         lower.includes('cannot find module') ||
         lower.includes('failed to compile') ||
         lower.includes('build failed') ||
         (lower.includes('error') && (lower.includes('node_modules') || lower.includes('package.json'))) ||
         lower.includes('unhandledrejection');
};

// ─── DETECCIÓN ESPECÍFICA PARA SCALA ─────────────────────────────────────────
const isScalaWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return (lower.includes('warning') && !lower.includes('error')) ||
         lower.includes('deprecated') ||
         lower.includes('unused import') ||
         lower.includes('unused private') ||
         lower.includes('feature warning');
};

const isScalaError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error:') ||
         lower.includes('exception') ||
         lower.includes('not found:') ||
         lower.includes('type mismatch') ||
         lower.includes('missing parameter') ||
         lower.includes('diverging implicit expansion') ||
         lower.includes('error]') ||  
         lower.includes(' error ') ||  
         (lower.includes('error') && !lower.includes('[info]')) ||
         lower.includes('failed') ||
         lower.includes('exception in thread');
};

// ─── DETECCIÓN GENÉRICA (fallback para otros lenguajes) ─────────────────────
const isGenericWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('warning:') ||
         lower.includes('warn:') ||
         lower.includes('[warn]') ||
         lower.includes('deprecated') ||
         lower.includes('obsolete');
};

const isGenericError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error:') ||
         lower.includes('fatal:') ||
         lower.includes('exception:') ||
         lower.includes('failed:') ||
         lower.includes('failed:') ||
         lower.includes('amazon.s3.amazons3exception') ||
         lower.includes('amazons3exception') ||
         lower.includes('exception') ||
         lower.includes('s3exception') ||
         lower.includes('http error');
         
};

// ─── FUNCIÓN PRINCIPAL DE CLASIFICACIÓN ──────────────────────────────────────
const classifyLine = (
  content: string, 
  outputType: string, 
  projectType?: string
): { category: 'error' | 'warning' | 'success' | 'info' | 'neutral'; color: string } => {
  
  // 🔥 Si es JSON y no contiene error explícito, tratarlo como neutral
  if (isJsonLine(content)) {
    const lower = content.toLowerCase();
    // Solo si contiene error explícito Y viene de stderr
    if (outputType === 'stderr' && (lower.includes('"error"') || lower.includes('"fatal"'))) {
      return { category: 'error', color: '#f87171' };
    }
    // JSON normal → neutral (sin color especial, el JsonViewer se encarga del formato)
    return { category: 'neutral', color: 'var(--text-console)' };
  }

  // 1. Verificar éxito primero (transversal)
  if (isSuccessLine(content)) {
    return { category: 'success', color: '#a8ffb0' };
  }

  // 2. Detección por lenguaje específico
  if (projectType === 'Rust') {
    if (isRustError(content)) return { category: 'error', color: '#f87171' };
    if (isRustWarning(content)) return { category: 'warning', color: '#fbbf24' };
    if (isRustNote(content)) return { category: 'info', color: '#60a5fa' };
    if (isRustLocationLine(content)) return { category: 'info', color: 'var(--text-muted)' };
  }
  
  else if (projectType === 'Python') {
    if (isPythonError(content)) return { category: 'error', color: '#f87171' };
    if (isPythonWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }
  
  else if (projectType === 'CSharp') {
    if (isCSharpError(content)) return { category: 'error', color: '#f87171' };
    if (isCSharpWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }
  
  else if (projectType === 'JavaScript') {
    if (isNodeError(content)) return { category: 'error', color: '#f87171' };
    if (isNodeWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }

  else if (projectType === 'React' || projectType === 'Node') {
    if (isNodeError(content)) return { category: 'error', color: '#f87171' };
    if (isNodeWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }
  
  else if (projectType === 'Scala') {
    if (isScalaError(content)) return { category: 'error', color: '#f87171' };
    if (isScalaWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }

  // 3. Detección genérica basada en el tipo de salida
  if (outputType === 'stderr') {
    if (isGenericWarning(content)) return { category: 'warning', color: '#fbbf24' };
    if (isGenericError(content)) return { category: 'error', color: '#f87171' };
    return { category: 'info', color: 'var(--text-console)' };
  }
  
  if (outputType === 'error') {
    return { category: 'error', color: '#f87171' };
  }
  
  if (outputType === 'info') {
    return { category: 'info', color: '#60a5fa' };
  }
  
  // 4. Caso por defecto (stdout normal)
  return { category: 'neutral', color: 'var(--text-console)' };
};

const openExternalUrl = async (url: string) => {
  if (isTauri()) {
    await openUrl(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};

// URLs clickeables y JSON viewer
const renderContentWithLinks = (content: string) => {
  // 🔥 Si es JSON, usar el JsonViewer component
  if (isJsonLine(content)) {
    return <JsonViewer content={content} />;
  }
  
  // Resto del código para URLs
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|dev|app|co|me|xyz|info|online|tech|site|cloud|github\.io|gitlab\.io|vercel\.app|netlify\.app|npmjs\.com)[^\s<>"{}|\\^`[\]]*)/gi;
  
  const parts = content.split(urlRegex);
  const matches = content.match(urlRegex) || [];
  let matchIndex = 0;
  
  return parts.map((part, i) => {
    if (matches[matchIndex] && part === matches[matchIndex]) {
      let url = part;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      matchIndex++;
      return (
        <button
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            void openExternalUrl(url).catch(error => {
              console.error('No se pudo abrir el enlace externo:', error);
            });
          }}
          className="hover:underline cursor-pointer inline-flex items-center gap-0.5 rounded px-0.5 transition-colors"
          style={{ color: '#60a5fa', background: 'none', border: 'none', padding: '0 2px' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(96,165,250,.15)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          title={`Click to open: ${url}`}
        >
          {part}
          <svg className="w-2.5 h-2.5 inline-block flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export function ConsoleTab({ tab, project, liveGitBranch, onStop, onClose, onRerun, onClear, allTabs, activeTabId, onSelectTab, onCloseTab, gitBranches, onOpenInFinder, onOpenInVSCode }: ConsoleTabProps) {
  const { terminalSize, terminalFontFamily, wrapTerminalLines, setWrapTerminalLines } = useTheme();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warning' | 'success'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showApiExplorer, setShowApiExplorer] = useState(false);
  const [isApiExplorerMaximized, setIsApiExplorerMaximized] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOpenMenu, setShowOpenMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tab.logs, autoScroll]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  useEffect(() => {
    const updateElapsed = () => {
      if (tab.status !== 'running') return;
      const start = new Date(tab.started_at).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [tab.started_at, tab.status]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+F: Toggle search
      if (ctrl && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => !prev);
        if (!showSearch) setSearchQuery('');
        return;
      }

      // Ctrl+Escape: Close search
      if (ctrl && e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
        return;
      }

      // Ctrl+L or Ctrl+Delete: Clear console
      if ((ctrl && e.key === 'l') || (ctrl && e.key === 'Delete')) {
        e.preventDefault();
        onClear(tab.process_id);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab: Cycle tabs
      if (ctrl && e.key === 'Tab') {
        e.preventDefault();
        const idx = allTabs.findIndex(t => t.process_id === activeTabId);
        if (e.shiftKey) {
          const prev = (idx - 1 + allTabs.length) % allTabs.length;
          onSelectTab(allTabs[prev].process_id);
        } else {
          const next = (idx + 1) % allTabs.length;
          onSelectTab(allTabs[next].process_id);
        }
        return;
      }

      // Ctrl+1..9: Switch to tab by position
      if (ctrl && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabIndex < allTabs.length) {
          onSelectTab(allTabs[tabIndex].process_id);
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch, allTabs, activeTabId, onSelectTab, onClear, tab.process_id]);

  // Filtrar logs según selección
  const filteredLogs = tab.logs.filter(line => {
    if (logFilter === 'all') return true;
    
    const classification = classifyLine(line.content, line.output_type, tab.project_type);
    
    if (logFilter === 'error') return classification.category === 'error';
    if (logFilter === 'warning') return classification.category === 'warning';
    if (logFilter === 'success') return classification.category === 'success';
    return true;
  });

  // Contar estadísticas usando la clasificación correcta
  const errorCount = tab.logs.filter(l => 
    classifyLine(l.content, l.output_type, tab.project_type).category === 'error'
  ).length;
  
  const warningCount = tab.logs.filter(l => 
    classifyLine(l.content, l.output_type, tab.project_type).category === 'warning'
  ).length;
  
  const successCount = tab.logs.filter(l => 
    classifyLine(l.content, l.output_type, tab.project_type).category === 'success'
  ).length;

  // Búsqueda en logs
  const searchFilteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return filteredLogs;
    const q = searchQuery.toLowerCase();
    return filteredLogs.filter(l => l.content.toLowerCase().includes(q));
  }, [filteredLogs, searchQuery]);

  const searchMatchCount = searchQuery.trim()
    ? searchFilteredLogs.reduce((sum, l) => {
        const q = searchQuery.toLowerCase();
        const content = l.content.toLowerCase();
        let count = 0, pos = 0;
        while ((pos = content.indexOf(q, pos)) !== -1) {
          count++;
          pos += q.length;
        }
        return sum + count;
      }, 0)
    : 0;

  // Highlight text matches in content
  const highlightText = (content: string): React.ReactNode => {
    if (!searchQuery.trim()) return content;
    const q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = content.split(new RegExp(`(${q})`, 'gi'));
    if (parts.length === 1) return content;
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase()
        ? <span key={i} className="rounded" style={{ backgroundColor: 'rgba(234,179,8,0.35)', color: '#fef08a', outline: '1px solid rgba(234,179,8,0.5)' }}>{part}</span>
        : part
    );
  };

  // Copiar todos los logs
  const copyAllLogs = async () => {
    const content = searchFilteredLogs.map(log => log.content).join('\n');
    await navigator.clipboard.writeText(content);
  };

  const handleClear = () => {
    if (tab.logs.length > 0) {
      onClear(tab.process_id);
    }
  };

  return (
    <div className={`console-shell h-full flex flex-col ${allTabs.length > 1 ? 'console-shell--with-tabs' : ''}`}>
      <header className="console-project-header" data-tauri-drag-region>
        <div className="console-project-identity">
          <div className="console-project-copy">
            <div>
              <h1>{tab.project_name}</h1>
              <span className={`console-status-pill console-status-pill--${tab.status}`}>
                <i />{tab.status === 'running' ? 'Running' : tab.status === 'error' ? 'Error' : 'Stopped'}
              </span>
            </div>
            <div className="console-project-meta">
              <span title="Configuración activa">{tab.config_name}</span>
              {(liveGitBranch || tab.git_branch) && <span title="Rama Git">⎇ {liveGitBranch || tab.git_branch}</span>}
              <span title="Tipo de proyecto">{project?.project_type || tab.project_type || 'Unknown'}</span>
              {project && <span title={`${project.configurations.length} comandos`}>{project.configurations.length} cmds</span>}
              {project && <span title={`${project.env_files.length} archivos de entorno`}>{project.env_files.length} env</span>}
              {tab.status === 'running' && <time title="Tiempo en ejecución">{elapsed}</time>}
            </div>
          </div>
        </div>

        <div className="console-project-actions">
          <div className="console-open-menu-wrap">
            <button
              type="button"
              className="console-icon-action console-icon-action--menu"
              onClick={() => setShowOpenMenu(value => !value)}
              title="Abrir proyecto en Finder o Visual Studio Code"
              aria-label="Abrir proyecto en otra aplicación"
              aria-expanded={showOpenMenu}
            >
              <FolderOpen size={14} /><ChevronDown size={11} />
            </button>
            {showOpenMenu && (
              <>
                <div className="popover-scrim" onClick={() => setShowOpenMenu(false)} />
                <div className="console-open-menu">
                  <button type="button" onClick={() => { setShowOpenMenu(false); onOpenInFinder(); }}><FolderOpen size={14} /><span>Finder</span></button>
                  <button type="button" onClick={() => { setShowOpenMenu(false); onOpenInVSCode(); }}><Code2 size={14} /><span>Visual Studio Code</span></button>
                </div>
              </>
            )}
          </div>
          {tab.status === 'running' ? (
            <button type="button" onClick={() => onStop(tab.process_id)} className="console-icon-action console-icon-action--stop" title="Detener proceso" aria-label="Detener proceso">
              <Square size={12} />
            </button>
          ) : (
            <button type="button" onClick={() => onRerun(tab.process_id)} className="console-icon-action console-icon-action--run" title={`Ejecutar de nuevo (${chord(MOD_KEY, 'R')})`} aria-label="Ejecutar de nuevo">
              <Play size={12} />
            </button>
          )}
          <button type="button" onClick={() => onClose(tab.process_id)} className="console-icon-action" title="Cerrar proceso" aria-label="Cerrar proceso">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="terminal-toolbar">
        <div className="terminal-toolbar__identity">
          <span>&gt;_</span>
          <strong>Consola</strong>
          <small>{tab.config_group || tab.config_name}</small>
        </div>

        <div className="terminal-toolbar__actions">
          {(errorCount > 0 || warningCount > 0 || successCount > 0) && (
            <div className="terminal-stats" aria-label="Resumen de salida">
              {errorCount > 0 && <span className="terminal-stat terminal-stat--error" title={`${errorCount} errores`}><i />{errorCount}</span>}
              {warningCount > 0 && <span className="terminal-stat terminal-stat--warning" title={`${warningCount} advertencias`}><i />{warningCount}</span>}
              {successCount > 0 && <span className="terminal-stat terminal-stat--success" title={`${successCount} mensajes exitosos`}><i />{successCount}</span>}
            </div>
          )}

          {showSearch ? (
            <div className="terminal-search">
              <Search size={12} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar en logs"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') { setShowSearch(false); setSearchQuery(''); }
                }}
              />
              {searchQuery && <small>{searchMatchCount}</small>}
              <button type="button" onClick={() => searchQuery ? setSearchQuery('') : setShowSearch(false)} title="Cerrar búsqueda">
                <SearchX size={12} />
              </button>
            </div>
          ) : (
            <button type="button" className="terminal-tool-button" onClick={() => setShowSearch(true)} title={`Buscar (${chord(MOD_KEY, 'F')})`}><Search size={13} /></button>
          )}

          <div className="terminal-tool-wrap">
            <button type="button" className={`terminal-tool-button ${logFilter !== 'all' ? 'terminal-tool-button--active' : ''}`} onClick={() => setShowFilterMenu(value => !value)} title="Filtrar logs"><Filter size={13} /></button>
            {showFilterMenu && (
              <>
                <div className="popover-scrim" onClick={() => setShowFilterMenu(false)} />
                <div className="terminal-popover terminal-filter-menu">
                  {[
                    { value: 'all', label: 'Todos' },
                    { value: 'error', label: `Errores · ${errorCount}` },
                    { value: 'warning', label: `Advertencias · ${warningCount}` },
                    { value: 'success', label: `Correctos · ${successCount}` },
                  ].map(filter => (
                    <button
                      type="button"
                      key={filter.value}
                      onClick={() => { setLogFilter(filter.value as typeof logFilter); setShowFilterMenu(false); }}
                      className={logFilter === filter.value ? 'is-selected' : ''}
                    >
                      <i className={`filter-mark filter-mark--${filter.value}`} />{filter.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button type="button" className="terminal-tool-button" onClick={copyAllLogs} disabled={filteredLogs.length === 0} title="Copiar salida"><Copy size={13} /></button>
          <button type="button" className={`terminal-tool-button terminal-tool-button--labeled ${showApiExplorer ? 'terminal-tool-button--active' : ''}`} onClick={() => setShowApiExplorer(value => !value)} title="Abrir cliente API"><Globe size={13} /><span>API</span></button>
          <button type="button" className={`terminal-tool-button ${autoScroll ? 'terminal-tool-button--active' : ''}`} onClick={() => setAutoScroll(value => !value)} title={autoScroll ? 'Desactivar auto-scroll' : 'Activar auto-scroll'}><ArrowDown size={13} /></button>
          <button type="button" className={`terminal-tool-button ${wrapTerminalLines ? 'terminal-tool-button--active' : ''}`} onClick={() => setWrapTerminalLines(!wrapTerminalLines)} title={wrapTerminalLines ? 'Permitir desplazamiento horizontal' : 'Ajustar líneas largas'}><WrapText size={14} /></button>
          <button type="button" className="terminal-tool-button" onClick={handleClear} disabled={tab.logs.length === 0} title={`Limpiar consola (${chord(MOD_KEY, 'L')})`}><Trash size={13} /></button>
        </div>
      </div>

      <div className="terminal-workspace">
        {(!showApiExplorer || !isApiExplorerMaximized) && (
          <div className={`terminal-output ${wrapTerminalLines ? 'terminal-output--wrap' : ''}`} style={{ fontFamily: terminalFontFamily, fontSize: `${TERMINAL_FONT_SIZES[terminalSize]}px` }}>
            {searchFilteredLogs.length === 0 ? (
              <div className="terminal-empty">
                <div>
                  <span>&gt;_</span>
                  <p>No hay salida para mostrar</p>
                  {logFilter !== 'all' && (
                    <small>Prueba cambiando el filtro</small>
                  )}
                  {searchQuery && (
                    <small>No hay resultados para “{searchQuery}”</small>
                  )}
                </div>
              </div>
            ) : (
              searchFilteredLogs.map((line, idx) => {
                const classification = classifyLine(line.content, line.output_type, tab.project_type);
                const isError = classification.category === 'error';
                const isWarning = classification.category === 'warning';
                const lineColor = classification.color;
                
                return (
                  <div 
                    key={line.id} 
                    className="terminal-line"
                    style={{
                      borderLeft: isError ? '2px solid #f87171' : isWarning ? '2px solid #fbbf24' : '2px solid transparent',
                      paddingLeft: '7px',
                      backgroundColor: isError ? 'rgba(248,113,113,0.06)' : isWarning ? 'rgba(251,191,36,0.06)' : 'transparent',
                    }}
                  >
                    {/* Número de línea con tooltip */}
                    <span
                      className="terminal-line__number"
                      style={{ color: 'var(--text-faint)' }}
                      title={`Línea ${idx + 1}${isError ? ' - Contiene un error' : isWarning ? ' - Contiene una advertencia' : ''}`}
                    >
                      {idx + 1}
                    </span>
                    {/* Timestamp con tooltip */}
                    <span
                      className="terminal-line__time"
                      style={{ color: 'var(--text-faint)' }}
                      title={new Date(line.timestamp).toLocaleString()}
                    >
                      {new Date(line.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {/* Contenido con URLs clickeables, JSON viewer y highlight de búsqueda */}
                    <span className="terminal-line__content" style={{ color: lineColor }}>
                      {searchQuery.trim() ? highlightText(line.content) : renderContentWithLinks(line.content)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* API Client (Mini Swagger/Postman Panel) */}
        {showApiExplorer && (
          <div className={`terminal-api-panel ${isApiExplorerMaximized ? 'terminal-api-panel--maximized' : ''}`}>
            <Suspense fallback={(
              <div className="h-full flex items-center justify-center bg-surface text-muted">
                Cargando explorador API…
              </div>
            )}>
              <ApiExplorer
                projectId={tab.project_id}
                projectName={tab.project_name}
                logs={tab.logs}
                isMaximized={isApiExplorerMaximized}
                onToggleMaximize={() => setIsApiExplorerMaximized(!isApiExplorerMaximized)}
                onClose={() => setShowApiExplorer(false)}
              />
            </Suspense>
          </div>
        )}
      </div>

      <ProcessTabBar
        tabs={allTabs}
        activeTabId={activeTabId}
        gitBranches={gitBranches}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />

    </div>
  );
}
