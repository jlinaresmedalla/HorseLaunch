import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronRight, ChevronDown } from 'lucide-react';
import { Project } from '../types';

interface QuickSwitchModalProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onExecuteCommand?: (projectId: string, configIndex: number) => void;
  onClose: () => void;
}

interface FlatItem {
  type: 'project' | 'command';
  project: Project;
  configIndex?: number;
  configName?: string;
  configCommand?: string;
}

const getProjectIcon = (type: string) => {
  const icons: Record<string, string> = { Python: '🐍', Scala: '🦭', CSharp: '🎯', React: '⚛️', JavaScript: '🟨' };
  return icons[type] || '📁';
};

export function QuickSwitchModal({ projects, onSelect, onExecuteCommand, onClose }: QuickSwitchModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(term));
  }, [projects, search]);

  const flatItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = [];
    for (const p of filtered) {
      items.push({ type: 'project', project: p });
      if (expandedProjectId === p.id) {
        for (let i = 0; i < p.configurations.length; i++) {
          const c = p.configurations[i];
          items.push({ type: 'command', project: p, configIndex: i, configName: c.name, configCommand: c.command });
        }
      }
    }
    return items;
  }, [filtered, expandedProjectId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (expandedProjectId) {
      const idx = flatItems.findIndex(
        item => item.type === 'project' && item.project.id === expandedProjectId
      );
      if (idx >= 0) {
        setSelectedIndex(idx + 1);
      }
    }
  }, [expandedProjectId]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const item = flatItems[selectedIndex];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (item?.type === 'project' && expandedProjectId !== item.project.id) {
          setExpandedProjectId(item.project.id);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (item?.type === 'command') {
          setExpandedProjectId(null);
        } else if (item?.type === 'project' && expandedProjectId === item.project.id) {
          setExpandedProjectId(null);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (!item) return;
        if (item.type === 'project') {
          if (expandedProjectId === item.project.id) {
            onSelect(item.project);
            onClose();
          } else {
            setExpandedProjectId(item.project.id);
          }
        } else if (item.configIndex !== undefined) {
          onExecuteCommand?.(item.project.id, item.configIndex);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl bg-surface border-light"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <Search size={16} className="text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proyecto..."
            className="flex-1 bg-transparent text-sm outline-none text-primary"
          />
          <button
            onClick={onClose}
            className="icon-button p-0.5 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {flatItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">
              {search ? 'No se encontraron proyectos' : 'No hay proyectos registrados'}
            </div>
          ) : (
            flatItems.map((item, i) => {
              const isSelected = i === selectedIndex;
              const isExpanded = item.type === 'project' && expandedProjectId === item.project.id;

              if (item.type === 'project') {
                return (
                  <button
                    key={item.project.id}
                    onClick={() => {
                      if (expandedProjectId === item.project.id) {
                        onSelect(item.project);
                        onClose();
                      } else {
                        setExpandedProjectId(item.project.id);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="text-base flex-shrink-0">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="text-lg flex-shrink-0">{getProjectIcon(item.project.project_type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.project.name}</div>
                      <div className="text-[11px] truncate text-muted">
                        {isExpanded ? `${item.project.configurations.length} commands` : item.project.path}
                      </div>
                    </div>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {item.project.project_type}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={`${item.project.id}-${item.configIndex}`}
                  onClick={() => {
                    if (item.configIndex !== undefined) {
                      onExecuteCommand?.(item.project.id, item.configIndex);
                      onClose();
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    paddingLeft: '68px',
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span style={{ color: 'var(--accent)', fontSize: '10px' }}>
                    ▶
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.configName}</div>
                    <div className="text-[11px] truncate text-muted">
                      {item.configCommand}
                    </div>
                  </div>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    Run
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-base" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>↑↓</kbd> Navegar
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>→</kbd> Expandir
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>Enter</kbd> Ejecutar
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>Esc</kbd> Cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
