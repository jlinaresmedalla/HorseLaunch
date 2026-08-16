import { X, Keyboard } from 'lucide-react';
import { formatShortcut } from '../hooks/useKeyboardShortcuts';
import { ALL_SHORTCUTS } from '../hooks/shortcutDefinitions';
import { chord, MOD_KEY } from '../utils/platform';

interface ShortcutHelpModalProps {
  onClose: () => void;
}

const categoryColors: Record<string, string> = {
  Global: '#6e7fff',
  Console: '#4ade80',
  Navigation: '#fbbf24',
  Modal: '#60a5fa',
};

export function ShortcutHelpModal({ onClose }: ShortcutHelpModalProps) {
  const categories = [...new Set(ALL_SHORTCUTS.map(s => s.category))] as string[];

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl overflow-hidden shadow-2xl bg-surface border-light"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <Keyboard size={18} style={{ color: '#6e7fff' }} />
            <span className="font-semibold text-primary">Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover transition-colors text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 max-h-96 overflow-y-auto">
          {categories.map(cat => (
            <div key={cat} className="mb-5 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColors[cat] || 'var(--text-muted)' }} />
                <span className="text-xs font-semibold uppercase" style={{ color: categoryColors[cat] || 'var(--text-muted)' }}>
                  {cat}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {ALL_SHORTCUTS
                  .filter(s => s.category === cat)
                  .map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-hover transition-colors">
                      <span className="text-xs text-secondary">{s.label}</span>
                      <kbd
                        className="text-[10px] font-mono px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border-light)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {formatShortcut(s)}
                      </kbd>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 bg-base" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-[10px] text-muted">
            Press <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>{chord(MOD_KEY, "/")}</kbd> to toggle this panel
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded bg-elevated border-light text-secondary hover:bg-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
