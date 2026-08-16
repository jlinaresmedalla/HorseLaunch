import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

let toastCounter = 0;

const iconMap: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={16} className="text-green-400" />,
  error: <AlertCircle size={16} className="text-red-400" />,
  info: <Info size={16} className="text-blue-400" />,
  warning: <AlertTriangle size={16} className="text-yellow-400" />,
};

const bgMap: Record<ToastType, string> = {
  success: 'rgba(34,197,94,.12)',
  error: 'rgba(239,68,68,.12)',
  info: 'rgba(96,165,250,.12)',
  warning: 'rgba(250,204,21,.12)',
};

const borderMap: Record<ToastType, string> = {
  success: 'rgba(34,197,94,.3)',
  error: 'rgba(239,68,68,.3)',
  info: 'rgba(96,165,250,.3)',
  warning: 'rgba(250,204,21,.3)',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = `toast-${++toastCounter}`;
    setToasts(prev => [...prev, { ...toast, id }]);

    if (toast.duration !== 0) {
      setTimeout(() => removeToast(id), toast.duration ?? 4000);
    }

    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-12 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="flex items-start gap-3 px-4 py-3 rounded-lg shadow-2xl text-sm animate-slide-up"
            style={{
              backgroundColor: bgMap[toast.type],
              border: `1px solid ${borderMap[toast.type]}`,
              color: '#f3f5fb',
            }}
          >
            <span className="flex-shrink-0 mt-0.5">{iconMap[toast.type]}</span>
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
                className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: borderMap[toast.type],
                  color: '#f3f5fb',
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-black/20 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
