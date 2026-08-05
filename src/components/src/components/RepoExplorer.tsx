import React from 'react';
import { Repository, RepoFile } from '../types';
import { useNavigation } from '../context/NavigationContext';

interface RepoExplorerProps {
  repo: Repository;
  onOpenFileInEditor: (file: RepoFile) => void;
}

export const RepoExplorer: React.FC<RepoExplorerProps> = ({ repo, onOpenFileInEditor }) => {
  const { navState, setRepoPath } = useNavigation();
  const currentPath = navState.repos.currentPath || '';

  const currentFiles = repo.files.filter((file) => {
    if (!currentPath) {
      return !file.path.includes('/');
    }
    if (!file.path.startsWith(currentPath + '/')) return false;
    const sub = file.path.slice(currentPath.length + 1);
    return !sub.includes('/');
  });

  const pathSegments = currentPath ? currentPath.split('/') : [];

  const navigateToSegment = (index: number) => {
    if (index === -1) {
      setRepoPath(repo.id, '');
    } else {
      const newPath = pathSegments.slice(0, index + 1).join('/');
      setRepoPath(repo.id, newPath);
    }
  };

  const handleItemClick = (file: RepoFile) => {
    if (file.type === 'dir') {
      setRepoPath(repo.id, file.path);
    } else {
      setRepoPath(repo.id, currentPath, file.path);
      onOpenFileInEditor(file);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center gap-1 text-sm bg-slate-950 px-3 py-2 rounded-lg mb-4 border border-slate-800 overflow-x-auto">
        <button
          onClick={() => navigateToSegment(-1)}
          className="hover:text-indigo-400 font-semibold text-slate-300 transition-colors flex items-center gap-1"
        >
          <span>📦</span> {repo.name}
        </button>
        {pathSegments.map((seg, idx) => (
          <React.Fragment key={idx}>
            <span className="text-slate-600">/</span>
            <button
              onClick={() => navigateToSegment(idx)}
              className="hover:text-indigo-400 text-slate-300 font-medium transition-colors"
            >
              {seg}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="divide-y divide-slate-800/60 rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
        {currentPath && (
          <button
            onClick={() => navigateToSegment(pathSegments.length - 2)}
            className="w-full text-left px-4 py-2.5 text-xs font-semibold text-indigo-400 hover:bg-slate-800/50 transition-colors flex items-center gap-2"
          >
            <span>📁</span> .. (parent directory)
          </button>
        )}

        {currentFiles.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-medium">
            No files or directories found in this path.
          </div>
        ) : (
          currentFiles.map((file) => {
            const isSelected = navState.repos.selectedFilePath === file.path;
            return (
              <button
                key={file.path}
                onClick={() => handleItemClick(file)}
                className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-indigo-950/60 text-indigo-200 border-l-2 border-indigo-500'
                    : 'hover:bg-slate-800/50 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-mono">
                  <span>{file.type === 'dir' ? '📁' : '📄'}</span>
                  <span className={file.type === 'dir' ? 'font-semibold text-slate-100' : 'text-slate-300'}>
                    {file.name}
                  </span>
                </div>
                {file.size && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {Math.round((file.size / 1024) * 10) / 10} KB
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
