export type TabType = 'repos' | 'history' | 'editor' | 'settings';

export interface RepoFile {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
  content?: string;
  sha?: string;
}

export interface Repository {
  id: string;
  name: string;
  owner: string;
  description: string;
  defaultBranch: string;
  isPrivate: boolean;
  zipUrl?: string;
  githubUrl?: string;
  files: RepoFile[];
  updatedAt: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  branch: string;
}

export interface NavigationState {
  activeTab: TabType;
  repos: {
    selectedRepoId: string | null;
    currentPath: string; // e.g. "src/components/ui"
    selectedFilePath: string | null;
  };
  history: {
    selectedRepoId: string | null;
    selectedBranch: string;
    selectedCommitHash: string | null;
  };
  editor: {
    selectedRepoId: string | null;
    activeFilePath: string | null;
    line: number;
  };
  settings: {
    activeSection: 'general' | 'git' | 'accounts' | 'navigation' | 'about';
  };
}
