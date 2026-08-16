import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Project } from '../types';

interface CommandPaletteModalProps {
  projects: Project[];
  onSelectCommand: (projectId: string, configIndex: number) => void;
  onAction: (action: string) => void;
  onClose: () => void;
}

interface PaletteItem {
  type: 'command' | 'action';
  label: string;
  sublabel?: string;
  projectId?: string;
  configIndex?: number;
  action?: string;
  icon?: string;
}

export function CommandPaletteModal({ projects, onSelectCommand, onAction, onClose }: CommandPaletteModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo((): PaletteItem[] => {
    const items: PaletteItem[] = [];

    // Action items
    items.push({
      type: 'action',
      label: 'Toggle theme',
      sublabel: 'Switch between dark and light mode',
      action: 'toggle-theme',
    });
    items.push({
      type: 'action',
      label: 'Add project',
      sublabel: 'Open folder browser to add a new project',
      action: 'add-project',
    });
    items.push({
      type: 'action',
      label: 'Add custom command',
      sublabel: 'Create a new custom command for the current project',
      action: 'add-command',
    });
    items.push({
      type: 'action',
      label: 'Close all tabs',
      sublabel: 'Stop and close all running processes',
      action: 'close-all-tabs',
    });
    items.push({
      type: 'action',
      label: 'Clear all projects',
      sublabel: 'Remove all registered projects',
      action: 'clear-projects',
    });
    items.push({
      type: 'action',
      label: 'Keyboard shortcuts',
      sublabel: 'Show available keyboard shortcuts',
      action: 'shortcut-help',
    });

    // Command items from all projects
    for (const project of projects) {
      for (let i = 0; i < project.configurations.length; i++) {
        const config = project.configurations[i];
        items.push({
          type: 'command',
          label: `${project.name} → ${config.name}`,
          sublabel: config.command,
          projectId: project.id,
          configIndex: i,
        });
      }
    }

    return items;
  }, [projects]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return allItems.filter(item =>
      item.label.toLowerCase().includes(term) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(term))
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
        if (filtered[selectedIndex]) {
          const item = filtered[selectedIndex];
          if (item.type === 'command' && item.projectId && item.configIndex !== undefined) {
            onSelectCommand(item.projectId, item.configIndex);
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

  const getItemIcon = (item: PaletteItem) => {
    if (item.type === 'command') return '⚡';
    switch (item.action) {
      case 'toggle-theme': return '🌓';
      case 'add-project': return '📂';
      case 'add-command': return '➕';
      case 'close-all-tabs': return '❌';
      case 'clear-projects': return '🗑️';
      case 'shortcut-help': return '⌨️';
      default: return '•';
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
            placeholder="Search commands and actions..."
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
              const isCommand = item.type === 'command';
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={`${item.type}-${item.action || item.label}-${i}`}
                  onClick={() => {
                    if (isCommand && item.projectId && item.configIndex !== undefined) {
                      onSelectCommand(item.projectId, item.configIndex);
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
                  <span className="text-base flex-shrink-0">{getItemIcon(item)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.label}</div>
                    {item.sublabel && (
                      <div className="text-[11px] truncate text-muted">{item.sublabel}</div>
                    )}
                  </div>
                  {isCommand && (
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
