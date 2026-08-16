import { useEffect, useState } from 'react';
import {
  Hammer,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import { ProcessTab, Project, ProjectConfig } from '../types';
import { chord, MOD_KEY, SHIFT_KEY } from '../utils/platform';
import { CommandButton } from './CommandButton';

interface SidebarProps {
  projects: Project[];
  processTabs: ProcessTab[];
  selectedProject: Project | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onSelectProject: (project: Project) => void;
  onRemoveProject: (id: string) => void;
  onAddProject: () => void;
  onExecuteCommand: (configIndex: number) => void;
  onEditCommand: (config: ProjectConfig, index: number) => void;
  onDeleteCommand: (configIndex: number) => void;
  onDuplicateCommand: (config: ProjectConfig, index: number) => void;
  onOpenCustomModal: (editingConfig: { config: ProjectConfig; index: number } | null) => void;
}

const isRunCmd = (name: string) => ['run', 'dev', 'start'].includes(name.toLowerCase());
const isBuildCmd = (name: string) => ['build', 'compile'].includes(name.toLowerCase());
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_WIDTH_KEY = 'horselaunch.sidebarWidth';

const initialSidebarWidth = () => {
  const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(savedWidth)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, savedWidth));
};

export function Sidebar({
  projects,
  processTabs,
  selectedProject,
  isCollapsed,
  onToggleCollapsed,
  onOpenCommandPalette,
  onOpenSettings,
  onSelectProject,
  onRemoveProject,
  onAddProject,
  onExecuteCommand,
  onEditCommand,
  onDeleteCommand,
  onDuplicateCommand,
  onOpenCustomModal,
}: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        onToggleCollapsed();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggleCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const handlePointerMove = (event: PointerEvent) => {
      const viewportLimit = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 520);
      const maximum = Math.min(SIDEBAR_MAX_WIDTH, viewportLimit);
      setSidebarWidth(Math.min(maximum, Math.max(SIDEBAR_MIN_WIDTH, event.clientX)));
    };
    const handlePointerUp = () => setIsResizing(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isResizing]);

  const renderCommand = (config: ProjectConfig, index: number) => (
    <CommandButton
      key={`${config.name}-${index}`}
      config={config}
      configIndex={index}
      onRun={onExecuteCommand}
      onEdit={onEditCommand}
      onDelete={onDeleteCommand}
      onDuplicate={onDuplicateCommand}
      icon={isRunCmd(config.name) ? <Play size={14} /> : isBuildCmd(config.name) ? <Hammer size={14} /> : <Settings size={14} />}
    />
  );

  return (
    <aside
      className={`sidebar-shell ${isCollapsed ? 'sidebar-shell--collapsed' : ''} ${isResizing ? 'sidebar-shell--resizing' : ''}`}
      style={isCollapsed ? undefined : { width: sidebarWidth, minWidth: sidebarWidth }}
    >
      {!isCollapsed && <div data-tauri-drag-region className="sidebar-window-drag-region" />}
      {!isCollapsed ? (
        <>
          <div className="sidebar-projects">
            <div className="sidebar-section-heading">
              <h2>PROYECTOS</h2>
              <button type="button" onClick={onAddProject} title="Añadir proyecto" aria-label="Añadir proyecto">
                <Plus size={14} />
              </button>
            </div>

            <div className="sidebar-project-list">
              {projects.map(project => {
                const projectProcesses = processTabs.filter(tab => tab.project_id === project.id);
                const runningCount = projectProcesses.filter(tab => tab.status === 'running').length;
                const isSelected = selectedProject?.id === project.id;

                return (
                  <div key={project.id} className={`sidebar-project-item ${isSelected ? 'sidebar-project-item--expanded' : ''}`}>
                    <div className={`sidebar-project-row ${isSelected ? 'sidebar-project-row--selected' : ''}`}>
                      <button
                        type="button"
                        className="sidebar-project-row__select"
                        onClick={() => onSelectProject(project)}
                        title={project.path}
                        aria-expanded={isSelected}
                        aria-controls={`project-commands-${project.id}`}
                      >
                        <span className={`sidebar-project-row__status ${runningCount > 0 ? 'sidebar-project-row__status--running' : ''}`} />
                        <span className="sidebar-project-row__copy">
                          <strong>{project.name}</strong>
                        </span>
                      </button>
                      <div className="sidebar-project-row__actions">
                        <button
                          type="button"
                          className="sidebar-project-row__remove"
                          onClick={() => onRemoveProject(project.id)}
                          title={`Quitar ${project.name}`}
                          aria-label={`Quitar ${project.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="sidebar-project-row__add"
                          onClick={() => {
                            onSelectProject(project);
                            onOpenCustomModal(null);
                          }}
                          title={`Añadir comando a ${project.name}`}
                          aria-label={`Añadir comando a ${project.name}`}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div id={`project-commands-${project.id}`} className="sidebar-project-accordion">
                        <div className="sidebar-project-command-list">
                          {project.configurations.map(renderCommand)}
                          {project.configurations.length === 0 && (
                            <p className="sidebar-command-empty">Sin comandos</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {projects.length === 0 && (
                <button type="button" onClick={onAddProject} className="sidebar-project-empty">
                  <Plus size={15} />
                  <span>Añade tu primer proyecto</span>
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="sidebar-collapsed-content">
          <button type="button" onClick={onAddProject} className="sidebar-collapsed-action" title="Añadir proyecto"><Plus size={17} /></button>
          <div className="sidebar-collapsed-divider" />
          {projects.slice(0, 6).map(project => {
            const running = processTabs.some(tab => tab.project_id === project.id && tab.status === 'running');
            return (
              <button
                type="button"
                key={project.id}
                onClick={() => onSelectProject(project)}
                className={`sidebar-collapsed-project ${selectedProject?.id === project.id ? 'sidebar-collapsed-project--selected' : ''}`}
                title={project.name}
              >
                <span className={`sidebar-collapsed-status ${running ? 'sidebar-collapsed-status--running' : ''}`} />
              </button>
            );
          })}
        </div>
      )}

      <footer className="sidebar-utility-bar">
        <button
          type="button"
          className="sidebar-utility-button sidebar-utility-button--toggle"
          onClick={onToggleCollapsed}
          title={`${isCollapsed ? 'Mostrar' : 'Ocultar'} barra lateral (${chord(MOD_KEY, 'B')})`}
          aria-label={isCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
          aria-pressed={!isCollapsed}
        >
          {isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <div className="sidebar-utility-bar__trailing">
          <button
            type="button"
            className="sidebar-utility-button"
            onClick={onOpenCommandPalette}
            title={`Buscar proyectos y acciones (${chord(MOD_KEY, SHIFT_KEY, 'P')})`}
            aria-label="Buscar proyectos y acciones"
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            className="sidebar-utility-button"
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Abrir Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </footer>

      {!isCollapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="Cambiar ancho de la barra lateral"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          onPointerDown={event => {
            event.preventDefault();
            setIsResizing(true);
          }}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowLeft' ? -10 : 10;
            setSidebarWidth(width => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width + direction)));
          }}
        />
      )}
    </aside>
  );
}
