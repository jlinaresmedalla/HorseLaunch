import { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Terminal } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMac } from '../utils/platform';

interface TitleProps {
  tabPosition: 'top' | 'bottom';
  onToggleTabPosition: () => void;
}

export function Title({ tabPosition, onToggleTabPosition }: TitleProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);

    const unlistenResize = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlistenResize.then(fn => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center gap-3 px-4 flex-shrink-0 select-none"
      style={{
        backgroundColor: '#0a0a10',
        borderBottom: '1px solid var(--border-color)',
        height: '36px',
        // On macOS the native traffic lights are drawn over the top-left of the window
        // (titleBarStyle "Overlay"), so the content has to start clear of them.
        paddingLeft: isMac ? '78px' : undefined,
      }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-elevated">
          <Terminal size={12} style={{ color: '#6e7fff' }} />
        </div>
        <span className="text-sm font-semibold tracking-wide" style={{ color: '#e2e4f0', fontSize: '13px' }}>
          HorseLaunch
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface text-muted border-standard">
          v0.2.1
        </span>
      </div>

      <div data-tauri-drag-region className="flex-1" />

      <button
        onClick={onToggleTabPosition}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all hover:bg-hover text-muted"
        title={tabPosition === 'top' ? 'Tabs abajo del console' : 'Tabs arriba del console'}
      >
        {tabPosition === 'top' ? '▼ Tabs' : '▲ Tabs'}
      </button>

      {/* Windows and Linux get drawn controls; macOS uses its own native traffic lights. */}
      <div className="flex items-center ml-2" style={{ gap: '2px', display: isMac ? 'none' : undefined }}>
        <button
          onClick={handleMinimize}
          className="w-[34px] h-[30px] flex items-center justify-center rounded-none transition-colors hover:bg-hover"
          style={{ color: '#8888a8' }}
          title="Minimizar"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="w-[34px] h-[30px] flex items-center justify-center rounded-none transition-colors hover:bg-hover"
          style={{ color: '#8888a8' }}
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          onClick={handleClose}
          className="w-[34px] h-[30px] flex items-center justify-center rounded-none transition-colors hover:bg-red-500/80 hover:text-white"
          style={{ color: '#8888a8' }}
          title="Cerrar"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
