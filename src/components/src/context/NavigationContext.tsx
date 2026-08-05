import React, { createContext, useContext, useState, useEffect } from 'react';
import { TabType, NavigationState } from '../types';

const STORAGE_KEY = 'gitpush_navigation_state_v1';

const initialNavigationState: NavigationState = {
  activeTab: 'repos',
  repos: {
    selectedRepoId: 'glit',
    currentPath: '',
    selectedFilePath: null,
  },
  history: {
    selectedRepoId: 'glit',
    selectedBranch: 'main',
    selectedCommitHash: null,
  },
  editor: {
    selectedRepoId: 'glit',
    activeFilePath: null,
    line: 1,
  },
  settings: {
    activeSection: 'general',
  },
};

interface NavigationContextType {
  navState: NavigationState;
  setActiveTab: (tab: TabType) => void;
  setRepoPath: (repoId: string, path: string, selectedFilePath?: string | null) => void;
  setHistoryState: (repoId: string, branch: string, commitHash?: string | null) => void;
  setEditorState: (repoId: string, filePath: string | null, line?: number) => void;
  setSettingsSection: (section: 'general' | 'git' | 'accounts' | 'navigation' | 'about') => void;
  resetNavigation: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navState, setNavState] = useState<NavigationState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load navigation state from storage', e);
    }
    return initialNavigationState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(navState));
    } catch (e) {
      console.warn('Failed to save navigation state', e);
    }
  }, [navState]);

  const setActiveTab = (tab: TabType) => {
    setNavState((prev) => ({
      ...prev,
      activeTab: tab,
    }));
  };

  const setRepoPath = (repoId: string, path: string, selectedFilePath: string | null = null) => {
    setNavState((prev) => ({
      ...prev,
      repos: {
        selectedRepoId: repoId,
        currentPath: path,
        selectedFilePath,
      },
    }));
  };

  const setHistoryState = (repoId: string, branch: string, commitHash: string | null = null) => {
    setNavState((prev) => ({
      ...prev,
      history: {
        selectedRepoId: repoId,
        selectedBranch: branch,
        selectedCommitHash: commitHash,
      },
    }));
  };

  const setEditorState = (repoId: string, filePath: string | null, line: number = 1) => {
    setNavState((prev) => ({
      ...prev,
      editor: {
        selectedRepoId: repoId,
        activeFilePath: filePath,
        line,
      },
    }));
  };

  const setSettingsSection = (section: 'general' | 'git' | 'accounts' | 'navigation' | 'about') => {
    setNavState((prev) => ({
      ...prev,
      settings: {
        activeSection: section,
      },
    }));
  };

  const resetNavigation = () => {
    setNavState(initialNavigationState);
  };

  return (
    <NavigationContext.Provider
      value={{
        navState,
        setActiveTab,
        setRepoPath,
        setHistoryState,
        setEditorState,
        setSettingsSection,
        resetNavigation,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
