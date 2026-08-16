import { X } from 'lucide-react';
import { ProcessTab } from '../types';

interface ProcessTabBarProps {
  tabs: ProcessTab[];
  activeTabId: string | null;
  gitBranches: Record<string, string | null>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function ProcessTabBar({ tabs, activeTabId, gitBranches, onSelectTab, onCloseTab }: ProcessTabBarProps) {
  if (tabs.length <= 1) return null;

  return (
    <nav className="process-tabs" aria-label="Procesos activos">
      <div className="process-tabs__scroll">
        {tabs.map(tab => {
          const isActive = tab.process_id === activeTabId;
          const branch = gitBranches[tab.project_id] ?? tab.git_branch;

          return (
            <div key={tab.process_id} className={`process-tab ${isActive ? 'process-tab--active' : ''}`}>
              <button
                type="button"
                onClick={() => onSelectTab(tab.process_id)}
                className="process-tab__select"
                title={`${tab.project_name} · ${tab.config_name}${branch ? ` · ${branch}` : ''}`}
              >
                <span className={`process-tab__status process-tab__status--${tab.status}`} />
                <span className="process-tab__project">{tab.project_name}</span>
                <small>{tab.config_name}</small>
                {tab.config_group && <em>{tab.config_group}</em>}
              </button>
              <button
                type="button"
                onClick={() => onCloseTab(tab.process_id)}
                className="process-tab__close"
                title={`Cerrar ${tab.config_name}`}
                aria-label={`Cerrar ${tab.config_name}`}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
