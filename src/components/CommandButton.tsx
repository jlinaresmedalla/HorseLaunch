import type { ReactNode } from 'react';
import { Copy, Edit3, Trash2 } from 'lucide-react';
import { ProjectConfig } from '../types';

interface CommandButtonProps {
  config: ProjectConfig;
  configIndex: number;
  icon: ReactNode;
  onRun: (configIndex: number) => void;
  onEdit: (config: ProjectConfig, index: number) => void;
  onDelete: (index: number) => void;
  onDuplicate: (config: ProjectConfig, index: number) => void;
}

export function CommandButton({ config, configIndex, icon, onRun, onEdit, onDelete, onDuplicate }: CommandButtonProps) {
  return (
    <div className="command-card flex items-center gap-1 group">
      <button
        className="command-card__launch flex-1 flex items-center gap-2.5 text-left min-w-0"
        onClick={() => onRun(configIndex)}
      >
        <span className="command-card__icon flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="command-card__name font-medium capitalize truncate flex items-center gap-1.5">
            {config.name}
          </div>
          <div className="command-card__command font-mono truncate text-muted">{config.command}</div>
        </div>
      </button>
      <div className="command-card__actions flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          className="icon-button p-1 rounded transition-colors"
          onClick={e => { e.stopPropagation(); onDuplicate(config, configIndex); }}
          title="Duplicar"
        >
          <Copy size={12} />
        </button>
        <button
          className="icon-button p-1 rounded transition-colors"
          onClick={e => { e.stopPropagation(); onEdit(config, configIndex); }}
          title="Editar"
        >
          <Edit3 size={12} />
        </button>
        <button
          className="icon-button p-1 rounded transition-colors hover:!text-red-400"
          onClick={e => { e.stopPropagation(); onDelete(configIndex); }}
          title="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
