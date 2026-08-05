import React, { useState } from 'react';

interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (repoUrl: string) => Promise<void>;
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({ isOpen, onClose, onClone }) => {
  const [url, setUrl] = useState('https://github.com/lildigitalsthedev/glit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await onClone(url.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to clone repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (quickUrl: string) => {
    setUrl(quickUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl text-slate-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>📥</span> Clone / Fetch Repository
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          Enter a GitHub URL or Zip file URL to load the repository directly into GitPush.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Repository or Zip URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              required
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-400">Quick Links:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickSelect('https://github.com/lildigitalsthedev/glit')}
                className="text-xs bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 rounded px-2.5 py-1 transition-colors"
              >
                lildigitalsthedev/glit
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect('https://github.com/lildigitalsthedev/glit/archive/refs/heads/main.zip')}
                className="text-xs bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 rounded px-2.5 py-1 transition-colors"
              >
                glit (.zip)
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-lg p-2.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md transition-colors flex items-center gap-2"
            >
              {loading ? 'Fetching...' : 'Clone / Load Repo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
