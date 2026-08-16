import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Project } from '../types';

interface ProjectPaletteModalProps {
  project: Project;
  onSelectCommand: (configIndex: number) => void;
  onAction: (action: string) => void;
  onClose: () => void;
}

interface PaletteItem {
  type: 'command' | 'action';
  label: string;
  sublabel?: string;
  configIndex?: number;
  action?: string;
  icon: string;
}

export function ProjectPaletteModal({
  project,
  onSelectCommand,
  onAction,
  onClose,
}: ProjectPaletteModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo((): PaletteItem[] => {
    const items: PaletteItem[] = [];

    for (let i = 0; i < project.configurations.length; i++) {
      const config = project.configurations[i];
      items.push({
        type: 'command',
        label: config.name,
        sublabel: config.command,
        configIndex: i,
        icon: '▶',
      });
    }

    if (items.length > 0) {
      items.push({ type: 'action', label: '', sublabel: '', action: 'separator', icon: '' });
    }

    items.push({
      type: 'action',
      label: 'Mostrar en Finder',
      sublabel: project.path,
      action: 'open-folder',
      icon: '📂',
    });

    items.push({
      type: 'action',
      label: 'Add custom command',
      sublabel: `Create a new command for ${project.name}`,
      action: 'add-command',
      icon: '➕',
    });

    items.push({
      type: 'action',
      label: 'Abrir en Visual Studio Code',
      sublabel: project.path,
      action: 'open-vscode',
      icon: '⌘',
    });

    return items;
  }, [project]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return allItems.filter(item =>
      item.action === 'separator' || (
        item.label.toLowerCase().includes(term) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(term))
      )
    );
  }, [allItems, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        {
          const item = filtered[selectedIndex];
          if (!item) return;
          if (item.action === 'separator') return;
          if (item.type === 'command' && item.configIndex !== undefined) {
            onSelectCommand(item.configIndex);
          } else if (item.action) {
            onAction(item.action);
          }
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
        className="w-full max-w-xl rounded-xl overflow-hidden shadow-2xl bg-surface border-light"
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
            placeholder={`Search ${project.name} commands...`}
            className="flex-1 bg-transparent text-sm outline-none text-primary"
          />
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-hover transition-colors text-muted"
          >
            <X size={14} />
          </button>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">
              {search ? 'No results found' : 'Type to search commands and actions'}
            </div>
          ) : (
            filtered.map((item, i) => {
              if (item.action === 'separator') {
                return <div key="sep" className="mx-4" style={{ borderTop: '1px solid var(--border-color)' }} />;
              }
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={`${item.type}-${item.action || item.label}-${i}`}
                  onClick={() => {
                    if (item.action === 'separator') return;
                    if (item.type === 'command' && item.configIndex !== undefined) {
                      onSelectCommand(item.configIndex);
                    } else if (item.action) {
                      onAction(item.action);
                    }
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="text-base flex-shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.label}</div>
                    {item.sublabel && (
                      <div className="text-[11px] truncate text-muted">{item.sublabel}</div>
                    )}
                  </div>
                  {item.type === 'command' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-elevated text-secondary flex-shrink-0">
                      Run
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-base" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>↑↓</kbd> Navigate
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>Enter</kbd> Select
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
