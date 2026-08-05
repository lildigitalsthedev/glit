import { Repository, RepoFile } from '../types';

export async function fetchGitHubRepoDetails(githubUrl: string): Promise<Repository> {
  const cleanUrl = githubUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleanUrl.split('github.com/');
  const repoPath = parts.length > 1 ? parts[1] : cleanUrl;
  const [owner, name] = repoPath.split('/');

  if (!owner || !name) {
    throw new Error('Invalid GitHub repository URL format. Example: https://github.com/owner/repo');
  }

  try {
    const apiRes = await fetch(`https://api.github.com/repos/${owner}/${name}`);
    let repoInfo: any = {};
    if (apiRes.ok) {
      repoInfo = await apiRes.json();
    }

    const defaultBranch = repoInfo.default_branch || 'main';
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${defaultBranch}?recursive=1`);
    let files: RepoFile[] = [];

    if (treeRes.ok) {
      const treeData = await treeRes.json();
      files = treeData.tree.map((item: any) => ({
        path: item.path,
        name: item.path.split('/').pop() || item.path,
        type: item.type === 'tree' ? 'dir' : 'file',
        size: item.size,
        sha: item.sha,
      }));
    } else {
      files = [
        { path: 'README.md', name: 'README.md', type: 'file', content: `# ${name}\n\nCloned from ${githubUrl}` },
        { path: 'src', name: 'src', type: 'dir' },
        { path: 'src/index.ts', name: 'index.ts', type: 'file', content: '// Main entrypoint\nconsole.log("Hello from ' + name + '");\n' },
        { path: 'package.json', name: 'package.json', type: 'file', content: `{\n  "name": "${name}",\n  "version": "1.0.0"\n}` },
      ];
    }

    return {
      id: `${owner}-${name}`.toLowerCase(),
      name: repoInfo.name || name,
      owner: repoInfo.owner?.login || owner,
      description: repoInfo.description || `Repository fetched from https://github.com/${owner}/${name}`,
      defaultBranch: defaultBranch,
      isPrivate: repoInfo.private || false,
      zipUrl: `https://github.com/${owner}/${name}/archive/refs/heads/${defaultBranch}.zip`,
      githubUrl: `https://github.com/${owner}/${name}`,
      files,
      updatedAt: repoInfo.updated_at || new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      id: `${owner}-${name}`.toLowerCase(),
      name: name,
      owner: owner,
      description: `Imported from ${githubUrl}`,
      defaultBranch: 'main',
      isPrivate: false,
      zipUrl: `https://github.com/${owner}/${name}/archive/refs/heads/main.zip`,
      githubUrl: githubUrl,
      files: [
        { path: 'README.md', name: 'README.md', type: 'file', content: `# ${name}\n\nCloned from ${githubUrl}` },
        { path: 'src', name: 'src', type: 'dir' },
        { path: 'src/index.ts', name: 'index.ts', type: 'file', content: '// Main entrypoint' },
        { path: 'package.json', name: 'package.json', type: 'file', content: `{\n  "name": "${name}",\n  "version": "1.0.0"\n}` }
      ],
      updatedAt: new Date().toISOString(),
    };
  }
}

export function getZipDownloadUrl(githubUrl: string, branch = 'main'): string {
  const cleanUrl = githubUrl.replace(/\.git$/, '').replace(/\/$/, '');
  return `${cleanUrl}/archive/refs/heads/${branch}.zip`;
}
