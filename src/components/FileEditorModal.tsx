import { useState, useCallback, useEffect, useRef } from 'react';
import { X, AlertTriangle, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { EditorTabs } from './EditorTabs';
import { chord, MOD_KEY } from '../utils/platform';

interface OpenFile {
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string;
}

interface FileEditorModalProps {
  projectPath: string;
  projectName?: string;
  gitBranch?: string | null;
  onClose: () => void;
}

const LANGUAGE_MAP: Record<string, string> = {
  py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', md: 'markdown', css: 'css', html: 'html', rs: 'rust',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', sql: 'sql',
  sh: 'shell', bat: 'shell', ps1: 'shell',
  cs: 'csharp', java: 'java',
};

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'text';
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function FileEditorModal({ projectPath, projectName, gitBranch, onClose }: FileEditorModalProps) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [confirmClose, setConfirmClose] = useState<boolean>(false);
  const [explorerCollapsed, setExplorerCollapsed] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(220);
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const openFilesRef = useRef(openFiles);
  const activeIndexRef = useRef(activeIndex);
  const isDraggingRef = useRef(false);

  openFilesRef.current = openFiles;
  activeIndexRef.current = activeIndex;

  const activeFile = activeIndex >= 0 ? openFiles[activeIndex] : null;

  const openFile = useCallback(async (path: string) => {
    const currentFiles = openFilesRef.current;
    const existingIndex = currentFiles.findIndex(f => f.path === path);
    if (existingIndex >= 0) {
      setActiveIndex(existingIndex);
      return;
    }
    try {
      const content = await readTextFile(path);
      const name = getFileName(path);
      const language = detectLanguage(path);
      const file: OpenFile = { path, name, language, content, savedContent: content };
      setOpenFiles(prev => [...prev, file]);
      setActiveIndex(currentFiles.length);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }, []);

  const closeFile = useCallback(async (index: number) => {
    const currentFiles = openFilesRef.current;
    const file = currentFiles[index];
    if (!file) return;
    if (file.content !== file.savedContent) {
      const confirmed = await new Promise<boolean>(resolve => {
        setConfirmClose(true);
        confirmResolveRef.current = resolve;
      });
      setConfirmClose(false);
      if (!confirmed) return;
    }
    setOpenFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      const currentIdx = activeIndexRef.current;
      if (currentIdx >= next.length) setActiveIndex(next.length - 1);
      else if (currentIdx === index) setActiveIndex(Math.min(index, next.length - 1));
      return next;
    });
  }, []);

  const saveFile = useCallback(async () => {
    const files = openFilesRef.current;
    const idx = activeIndexRef.current;
    const file = idx >= 0 ? files[idx] : null;
    console.log('saveFile called', { path: file?.path, idx, filesCount: files.length, isDirty: file ? file.content !== file.savedContent : 'n/a' });
    if (file && file.content !== file.savedContent) {
      try {
        await writeTextFile(file.path, file.content);
        console.log('saveFile succeeded');
        setOpenFiles(prev => prev.map((f, i) =>
          i === idx ? { ...f, savedContent: f.content } : f
        ));
      } catch (e) {
        console.error('Failed to save file:', e);
      }
    }
  }, []);

  const editContent = useCallback((content: string) => {
    const idx = activeIndexRef.current;
    setOpenFiles(prev => prev.map((f, i) =>
      i === idx ? { ...f, content } : f
    ));
  }, []);

  const handleExplorerResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = explorerWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newWidth = startWidth + (moveEvent.clientX - startX);
      setExplorerWidth(Math.max(150, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [explorerWidth]);

  const handleModalClose = useCallback(async () => {
    const dirty = openFiles.some(f => f.content !== f.savedContent);
    if (dirty) {
      const confirmed = await new Promise<boolean>(resolve => {
        setConfirmClose(true);
        confirmResolveRef.current = resolve;
      });
      setConfirmClose(false);
      if (!confirmed) return;
    }
    onClose();
  }, [openFiles, onClose]);

  const handleConfirmResponse = (confirmed: boolean) => {
    confirmResolveRef.current?.(confirmed);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setIsMaximized(prev => !prev);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmClose) {
          handleConfirmResponse(false);
          return;
        }
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleModalClose, confirmClose, saveFile]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className={`flex flex-col overflow-hidden shadow-2xl ${isMaximized ? 'rounded-none' : 'rounded-xl'}`}
        style={{
          width: isMaximized ? '100vw' : '92vw',
          height: isMaximized ? '100vh' : '88vh',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExplorerCollapsed(prev => !prev)}
              className="p-0.5 rounded hover:bg-hover transition-colors text-muted"
              title={explorerCollapsed ? 'Show explorer' : 'Hide explorer'}
            >
              {explorerCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </button>
            <span className="text-xs font-medium text-muted">📁 File Editor</span>
            {projectName && (
              <>
                <span className="text-[10px]" style={{ color: '#555878' }}>·</span>
                <span className="text-[11px] font-medium text-secondary">{projectName}</span>
                {gitBranch && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    {gitBranch}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFile && activeFile.content !== activeFile.savedContent && (
              <>
                <span className="text-[10px] text-muted">Unsaved changes</span>
                <button
                  onClick={() => saveFile()}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                >
                  Save
                </button>
              </>
            )}
            <button
              onClick={() => setIsMaximized(prev => !prev)}
              className="p-1 rounded hover:bg-hover transition-colors text-muted"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={handleModalClose}
              className="p-1 rounded hover:bg-hover transition-colors text-muted"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {openFiles.length > 0 && (
          <EditorTabs
            files={openFiles.map(f => ({ path: f.path, name: f.name, language: f.language, dirty: f.content !== f.savedContent }))}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            onClose={closeFile}
          />
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Explorer */}
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{
              width: explorerCollapsed ? '0px' : `${explorerWidth}px`,
              borderRight: explorerCollapsed ? 'none' : '1px solid var(--border-color)',
              transition: isDraggingRef.current ? 'none' : 'width 200ms',
            }}
          >
            {!explorerCollapsed && <FileExplorer rootPath={projectPath} onOpenFile={openFile} />}
          </div>

          {/* Resize handle */}
          {!explorerCollapsed && (
            <div
              onMouseDown={handleExplorerResizeStart}
              className="flex-shrink-0 cursor-col-resize hover:bg-[#6e7fff] transition-colors"
              style={{ width: '4px', backgroundColor: 'transparent', backgroundClip: 'content-box' }}
              title="Drag to resize"
            />
          )}

          {/* Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeFile ? (
              <CodeEditor
                key={activeFile.path}
                content={activeFile.content}
                language={activeFile.language}
                onChange={editContent}
                onSave={saveFile}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center flex-col gap-3 text-muted">
                <span className="text-3xl opacity-20">📄</span>
                <p className="text-sm">Select a file from the explorer to start editing</p>
                <p className="text-xs">Press <kbd className="bg-elevated border-light px-1 py-0.5 rounded" style={{ fontSize: '10px' }}>Esc</kbd> to close</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-1.5 flex-shrink-0 bg-base" style={{ borderTop: '1px solid var(--border-color)' }}>
          {activeFile && activeFile.content !== activeFile.savedContent && (
            <span className="text-[10px]" style={{ color: '#fbbf24' }}>● Modified</span>
          )}
          {activeFile && (
            <span className="text-[10px] text-muted">{activeFile.path}</span>
          )}
          <span className="text-[10px] text-muted ml-auto">
            <kbd className="bg-elevated border-light px-1 py-0.5 rounded">{chord(MOD_KEY, "S")}</kbd> Save
          </span>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl p-6 shadow-2xl max-w-sm w-full" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} style={{ color: '#fbbf24' }} />
              <span className="text-sm font-medium text-primary">Unsaved changes</span>
            </div>
            <p className="text-xs text-secondary mb-6">
              You have unsaved changes. Do you want to discard them?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleConfirmResponse(false)}
                className="px-4 py-1.5 rounded text-xs font-medium transition-colors btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmResponse(true)}
                className="px-4 py-1.5 rounded text-xs font-medium transition-colors"
                style={{ backgroundColor: 'rgba(239,68,68,.85)', color: '#fff' }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
