import { AppWindow, Keyboard, Moon, Sun, Terminal, Type, WrapText, X } from 'lucide-react';
import {
  TERMINAL_FONT_OPTIONS,
  TERMINAL_FONT_SIZES,
  SizeLevel,
  useTheme,
} from '../contexts/ThemeContext';

interface SettingsModalProps {
  onClose: () => void;
  onOpenShortcuts: () => void;
}

const SIZE_OPTIONS: { value: SizeLevel; label: string; sample: string }[] = [
  { value: 'small', label: 'Pequeño', sample: 'S' },
  { value: 'medium', label: 'Medio', sample: 'M' },
  { value: 'large', label: 'Grande', sample: 'L' },
];

function SizeControl({ value, onChange }: { value: SizeLevel; onChange: (value: SizeLevel) => void }) {
  return (
    <div className="settings-segmented" role="radiogroup" aria-label="Tamaño de fuente">
      {SIZE_OPTIONS.map(option => (
        <button
          type="button"
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'is-selected' : ''}
          onClick={() => onChange(option.value)}
          title={`Tamaño ${option.label.toLowerCase()}`}
        >
          <span>{option.sample}</span>
          <small>{option.label}</small>
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({ onClose, onOpenShortcuts }: SettingsModalProps) {
  const {
    theme,
    setTheme,
    appSize,
    setAppSize,
    terminalSize,
    setTerminalSize,
    terminalFontFamily,
    setTerminalFontFamily,
    wrapTerminalLines,
    setWrapTerminalLines,
  } = useTheme();

  return (
    <div className="modal-backdrop settings-backdrop" onClick={onClose}>
      <section className="settings-panel" onClick={event => event.stopPropagation()} aria-label="Configuración">
        <header className="settings-panel__header">
          <h1>Settings</h1>
          <button type="button" onClick={onClose} title="Cerrar Settings" aria-label="Cerrar Settings"><X size={16} /></button>
        </header>

        <div className="settings-panel__content">
          <section className="settings-group">
            <div className="settings-group__title"><AppWindow size={15} /><h2>Aplicación</h2></div>

            <div className="settings-row settings-row--stacked">
              <strong>Tamaño general</strong>
              <SizeControl value={appSize} onChange={setAppSize} />
            </div>

            <div className="settings-row">
              <strong>Tema</strong>
              <div className="settings-theme-toggle" role="radiogroup" aria-label="Tema">
                <button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'is-selected' : ''} onClick={() => setTheme('light')} title="Tema claro"><Sun size={14} /></button>
                <button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'is-selected' : ''} onClick={() => setTheme('dark')} title="Tema oscuro"><Moon size={14} /></button>
              </div>
            </div>
          </section>

          <section className="settings-group">
            <div className="settings-group__title"><Terminal size={15} /><h2>Terminal</h2></div>

            <div className="settings-row settings-row--stacked">
              <strong>Tamaño de salida · {TERMINAL_FONT_SIZES[terminalSize]} px</strong>
              <SizeControl value={terminalSize} onChange={setTerminalSize} />
            </div>

            <label className="settings-row" htmlFor="settings-terminal-font">
              <strong><Type size={13} /> Fuente</strong>
              <select id="settings-terminal-font" value={terminalFontFamily} onChange={event => setTerminalFontFamily(event.target.value)}>
                {TERMINAL_FONT_OPTIONS.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="settings-row" htmlFor="settings-wrap-lines">
              <strong><WrapText size={13} /> Ajustar líneas</strong>
              <input id="settings-wrap-lines" className="settings-switch-input" type="checkbox" checked={wrapTerminalLines} onChange={event => setWrapTerminalLines(event.target.checked)} />
              <span className="settings-switch" aria-hidden="true"><i /></span>
            </label>

            <code className="settings-terminal-preview" style={{ fontFamily: terminalFontFamily, fontSize: `${TERMINAL_FONT_SIZES[terminalSize]}px` }}>
              npm run dev · Server ready at http://localhost:3000
            </code>
          </section>
        </div>

        <footer className="settings-panel__footer">
          <button type="button" onClick={onOpenShortcuts}><Keyboard size={14} /><span>Atajos de teclado</span></button>
        </footer>
      </section>
    </div>
  );
}
