import { useState } from 'react';
import { Settings, X, AlertCircle, Loader2, Save } from 'lucide-react';
import { ProjectConfig } from '../types';
import { isMac } from '../utils/platform';

interface CustomCommandModalProps {
  projectId: string;
  editingConfig?: { config: ProjectConfig; index: number } | null;
  onSave: (projectId: string, config: ProjectConfig, editIndex?: number) => Promise<void>;
  onClose: () => void;
}

export function CustomCommandModal({ projectId, editingConfig, onSave, onClose }: CustomCommandModalProps) {
  const [name, setName] = useState(editingConfig?.config.name ?? '');
  const [command, setCommand] = useState(editingConfig?.config.command ?? '');
  const [workingDir, setWorkingDir] = useState(editingConfig?.config.working_dir ?? '');
  const [envVarsText, setEnvVarsText] = useState(
    editingConfig
      ? Object.entries(editingConfig.config.env_vars).map(([k, v]) => `${k}=${v}`).join('\n')
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parseEnvVars = (): Record<string, string> => {
    const result: Record<string, string> = {};
    envVarsText.split('\n').forEach(line => {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        if (key) result[key] = val;
      }
    });
    return result;
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!command.trim()) { setError('Command is required'); return; }
    setSaving(true);
    setError('');
    try {
      const config: ProjectConfig = {
        name: name.trim(),
        command: command.trim(),
        working_dir: workingDir.trim(),
        env_vars: parseEnvVars(),
        requires_build: false,
        build_command: undefined,
        custom_paths: {},
        group: editingConfig?.config.group,
      };
      await onSave(projectId, config, editingConfig?.index);
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl bg-surface border-light"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <Settings size={18} style={{ color: '#6e7fff' }} />
            <span className="font-semibold">{editingConfig ? 'Edit Command' : 'New Custom Command'}</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 transition-colors text-muted"
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5 text-muted">
              Name *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. run-sentinel"
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none transition-colors bg-base border-light text-primary"
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-light)')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5 text-muted">
              Command *
            </label>
            <textarea
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder={
                isMac
                  ? `e.g. export ENV=dev PYTHONPATH=.; source .venv/bin/activate; python main.py run-sentinel`
                  : `e.g. $env:ENV='dev'; $env:PYTHONPATH='.'; .venv\\Scripts\\activate; python main.py run-sentinel`
              }
              rows={3}
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none resize-none transition-colors bg-base border-light text-primary"
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-light)')}
            />
            <p className="text-xs mt-1 text-muted">
              {isMac ? 'zsh syntax. ' : 'PowerShell syntax. '}
              Use{' '}
              <code style={{ color: '#6e7fff' }}>
                {isMac ? 'VAR=value' : "$env:VAR='value'"}
              </code>{' '}
              for env vars inline.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5 text-muted">
              Working Directory (leave blank to use project root)
            </label>
            <input
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
              placeholder={isMac ? 'e.g. /Users/me/projects/myapp' : 'e.g. C:\\projects\\myapp'}
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none transition-colors bg-base border-light text-primary"
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-light)')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5 text-muted">
              Environment Variables (KEY=value, one per line)
            </label>
            <textarea
              value={envVarsText}
              onChange={e => setEnvVarsText(e.target.value)}
              placeholder={`ENV=dev\nPYTHONPATH=.\nMY_SECRET=abc123`}
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none resize-none transition-colors bg-base border-light text-primary"
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-light)')}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md" style={{ backgroundColor: 'rgba(239,68,68,.1)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)' }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm transition-colors text-muted border-light"
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 text-white transition-all"
            style={{ backgroundColor: '#6e7fff' }}
            onMouseEnter={e => !saving && (e.currentTarget.style.backgroundColor = '#8090ff')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#6e7fff')}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Command'}
          </button>
        </div>
      </div>
    </div>
  );
}
