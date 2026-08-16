import { useEffect, useState } from 'react';
import {
  Copy,
  Minus,
  Square,
  X,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { isMac } from '../utils/platform';

const appWindow = isTauri() ? getCurrentWindow() : null;

export function Title() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    appWindow.isMaximized().then(setIsMaximized);

    const unlistenResize = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized());
    });

    return () => {
      unlistenResize.then(unlisten => unlisten());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className={`titlebar flex items-center flex-shrink-0 select-none ${isMac ? 'titlebar--mac' : ''}`}
    >
      <div data-tauri-drag-region className="titlebar__drag flex-1 h-full" />

      {!isMac && (
        <div className="titlebar__trailing flex items-center">
          <div className="titlebar__window-controls flex items-center">
            <button type="button" onClick={() => appWindow?.minimize()} className="titlebar-window-button" title="Minimizar">
              <Minus size={13} />
            </button>
            <button
              type="button"
              onClick={() => appWindow?.toggleMaximize()}
              className="titlebar-window-button"
              title={isMaximized ? 'Restaurar' : 'Maximizar'}
            >
              {isMaximized ? <Copy size={11} /> : <Square size={11} />}
            </button>
            <button type="button" onClick={() => appWindow?.close()} className="titlebar-window-button titlebar-window-button--close" title="Cerrar">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
