import React, { useState } from 'react';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { Repository, RepoFile } from './types';
import { fetchGitHubRepoDetails, getZipDownloadUrl } from './services/githubService';
import { CloneRepoModal } from './components/CloneRepoModal';
import { RepoExplorer } from './components/RepoExplorer';

const defaultGlitRepo: Repository = {
  id: 'glit',
  name: 'glit',
  owner: 'lildigitalsthedev',
  description: 'GitPush native lightweight client & tools repository',
  defaultBranch: 'main',
  isPrivate: false,
  zipUrl: 'https://github.com/lildigitalsthedev/glit/archive/refs/heads/main.zip',
  githubUrl: 'https://github.com/lildigitalsthedev/glit',
  updatedAt: new Date().toISOString(),
  files: [
    {
      path: 'README.md',
      name: 'README.md',
      type: 'file',
      content: '# glit\n\nLightweight Git tools and utilities by @lildigitalsthedev.\n\nHosted on GitHub: https://github.com/lildigitalsthedev/glit',
    },
    { path: 'src', name: 'src', type: 'dir' },
    { path: 'src/components', name: 'components', type: 'dir' },
    { path: 'src/components/ui', name: 'ui', type: 'dir' },
    {
      path: 'src/components/ui/Button.tsx',
      name: 'Button.tsx',
      type: 'file',
      content: 'export const Button = () => <button className="px-3 py-1 bg-indigo-600 rounded">Click</button>;',
    },
    { path: 'src/index.ts', name: 'index.ts', type: 'file', content: 'console.log("glit initialized");' },
    { path: 'package.json', name: 'package.json', type: 'file', content: '{\n  "name": "glit",\n  "version": "1.0.0"\n}' },
  ],
};

const MainApp: React.FC = () => {
  const { navState, setActiveTab, setEditorState, setSettingsSection, setHistoryState } = useNavigation();
  const [repos, setRepos] = useState<Repository[]>([defaultGlitRepo]);
  const [isCloneOpen, setIsCloneOpen] = useState(false);

  const activeRepo = repos.find((r) => r.id === navState.repos.selectedRepoId) ?? repos[0]!;

  const handleCloneRepo = async (githubUrl: string) => {
    const newRepo = await fetchGitHubRepoDetails(githubUrl);
    setRepos((prev) => {
      const exists = prev.some((r) => r.id === newRepo.id);
      if (exists) {
        return prev.map((r) => (r.id === newRepo.id ? newRepo : r));
      }
      return [...prev, newRepo];
    });
  };

  const handleOpenFile = (file: RepoFile) => {
    setEditorState(activeRepo.id, file.path, 1);
    setActiveTab('editor');
  };

  const downloadZip = (repo: Repository) => {
    const url = repo.zipUrl || getZipDownloadUrl(repo.githubUrl || 'https://github.com/lildigitalsthedev/glit');
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white font-black text-lg px-2.5 py-1 rounded-lg tracking-wider">
            GitPush
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">
              {activeRepo.owner}/{activeRepo.name}
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Context-Aware Navigation Active • Branch: {activeRepo.defaultBranch}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadZip(activeRepo)}
            className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Download Repository ZIP file"
          >
            <span>⚡</span> Download Zip
          </button>
          <button
            onClick={() => setIsCloneOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>➕</span> Clone / Load Repo
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        {navState.activeTab === 'repos' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>📁</span> Repositories
              </h2>
              <div className="text-xs text-slate-400">
                Current Location:{' '}
                <span className="font-mono text-indigo-300">
                  {activeRepo.name}/{navState.repos.currentPath || ''}
                </span>
              </div>
            </div>

            <RepoExplorer repo={activeRepo} onOpenFileInEditor={handleOpenFile} />
          </div>
        )}

        {navState.activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>📜</span> Commit History
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
              <div className="text-xs text-slate-400">
                Viewing history for <span className="text-indigo-300 font-mono">{activeRepo.name}</span> on branch{' '}
                <span className="text-emerald-400 font-mono">{navState.history.selectedBranch}</span>
              </div>
              <div className="space-y-2">
                <div
                  onClick={() => setHistoryState(activeRepo.id, 'main', '8f3a12b')}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                    navState.history.selectedCommitHash === '8f3a12b'
                      ? 'bg-indigo-950/60 border-indigo-500'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-mono text-slate-300">
                    <span className="font-bold text-indigo-400">commit 8f3a12b</span>
                    <span>2 hours ago</span>
                  </div>
                  <p className="mt-1 text-slate-200">Update repository structure and add glit integration</p>
                  <p className="text-[10px] text-slate-400 mt-1">Author: @lildigitalsthedev</p>
                </div>

                <div
                  onClick={() => setHistoryState(activeRepo.id, 'main', '2c9d01e')}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                    navState.history.selectedCommitHash === '2c9d01e'
                      ? 'bg-indigo-950/60 border-indigo-500'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-mono text-slate-300">
                    <span className="font-bold text-indigo-400">commit 2c9d01e</span>
                    <span>Yesterday</span>
                  </div>
                  <p className="mt-1 text-slate-200">Initial commit for glit repository</p>
                  <p className="text-[10px] text-slate-400 mt-1">Author: @lildigitalsthedev</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {navState.activeTab === 'editor' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>📝</span> Code Editor
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="bg-slate-950 border-b border-slate-800 px-4 py-2 text-xs font-mono text-indigo-300 flex items-center justify-between">
                <span>{navState.editor.activeFilePath || 'No file selected'}</span>
                {navState.editor.activeFilePath && (
                  <span className="text-[10px] text-slate-500">UTF-8 • Line {navState.editor.line}</span>
                )}
              </div>
              <div className="p-4 font-mono text-xs bg-slate-950/90 text-slate-200 min-h-[280px] overflow-x-auto">
                {navState.editor.activeFilePath ? (
                  <pre className="whitespace-pre">
                    {activeRepo.files.find((f) => f.path === navState.editor.activeFilePath)?.content ||
                      `// Editing ${navState.editor.activeFilePath}\n// Changes are kept in memory.`}
                  </pre>
                ) : (
                  <div className="text-slate-500 italic">Select a file from the Repos tab to edit.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {navState.activeTab === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>⚙️</span> Settings
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
              <div className="flex gap-2 border-b border-slate-800 pb-3">
                {(['general', 'git', 'accounts', 'navigation', 'about'] as const).map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setSettingsSection(sec)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                      navState.settings.activeSection === sec
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-300">
                {navState.settings.activeSection === 'general' && (
                  <p>General application settings & preferences.</p>
                )}
                {navState.settings.activeSection === 'navigation' && (
                  <p>
                    Context-Aware Navigation (Feature 13) is active. Tab states are remembered automatically across session
                    switches.
                  </p>
                )}
                {navState.settings.activeSection === 'about' && (
                  <p>
                    GitPush v3.0 • Repository:{' '}
                    <a
                      href="https://github.com/lildigitalsthedev/glit"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 underline"
                    >
                      https://github.com/lildigitalsthedev/glit
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 py-2 px-4 flex justify-around items-center z-40">
        <button
          onClick={() => setActiveTab('repos')}
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
            navState.activeTab === 'repos' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">📁</span>
          <span>Repos</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
            navState.activeTab === 'history' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">📜</span>
          <span>History</span>
        </button>

        <button
          onClick={() => setActiveTab('editor')}
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
            navState.activeTab === 'editor' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">📝</span>
          <span>Editor</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
            navState.activeTab === 'settings' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">⚙️</span>
          <span>Settings</span>
        </button>
      </nav>

      <CloneRepoModal isOpen={isCloneOpen} onClose={() => setIsCloneOpen(false)} onClone={handleCloneRepo} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <NavigationProvider>
      <MainApp />
    </NavigationProvider>
  );
};

export default App;
