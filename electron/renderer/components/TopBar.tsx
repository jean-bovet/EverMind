import { Settings } from 'lucide-react';

interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}

interface TopBarProps {
  selectedNotebook: string | null;
  notebooks: Notebook[];
  onNotebookChange: (notebookGuid: string) => void;
  onSettingsClick: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
  selectedNotebook,
  notebooks,
  onNotebookChange,
  onSettingsClick,
}) => {
  const handleNotebookChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onNotebookChange(event.target.value);
  };

  return (
    <div className="top-bar">
      <h1>Evernote AI Importer</h1>

      <div className="top-bar-controls">
        <div className="notebook-selector">
          <label htmlFor="notebook-select">Notebook:</label>
          <select
            id="notebook-select"
            value={selectedNotebook || ''}
            onChange={handleNotebookChange}
            disabled={notebooks.length === 0}
          >
            {notebooks.length === 0 ? (
              <option value="">Loading...</option>
            ) : (
              notebooks.map((notebook) => (
                <option key={notebook.guid} value={notebook.guid}>
                  {notebook.name}
                  {notebook.defaultNotebook ? ' (Default)' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <button
          className="settings-button"
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
};

export default TopBar;
