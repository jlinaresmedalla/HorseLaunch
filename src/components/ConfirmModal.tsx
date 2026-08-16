import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  confirmStyle = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmColor = confirmStyle === 'danger'
    ? { bg: '#ef4444', hover: '#dc2626' }
    : { bg: '#6e7fff', hover: '#8090ff' };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl overflow-hidden shadow-2xl bg-surface border-light"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} style={{ color: '#f87171' }} />
            <span className="font-semibold">{title}</span>
          </div>
          <button
            onClick={onCancel}
            className="icon-button rounded p-1 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-secondary">{message}</p>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm transition-colors text-muted border-light"
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
            style={{ backgroundColor: confirmColor.bg }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = confirmColor.hover; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = confirmColor.bg; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
