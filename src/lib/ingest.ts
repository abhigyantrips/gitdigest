'use client';

import JSZip from 'jszip';

const SEPARATOR = '='.repeat(48);

// From official gitingest DEFAULT_IGNORE_PATTERNS
const DEFAULT_IGNORE_PATTERNS = [
  '.git',
  'node_modules',
  '__pycache__',
  '.pytest_cache',
  '.next',
  '.vscode',
  '.idea',
  'dist',
  'build',
  '*.pyc',
  '*.log',
  '.DS_Store',
  '*.svg',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.pdf',
  'package-lock.json',
  'yarn.lock',
  '.pnpm-store',
  'bun.lock',
  'poetry.lock',
];

interface IngestOptions {
  maxFileSize: number; // in KB
  includePatterns?: string[];
  excludePatterns?: string[];
  token?: string;
}

interface IngestResult {
  repo_url: string;
  short_repo_url: string;
  summary: string;
  tree: string;
  content: string;
}

interface ParsedRepo {
  host: string;
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

function parseGitUrl(url: string): ParsedRepo | null {
  // Remove .git suffix
  url = url.replace(/\.git$/, '').trim();

  // Known Git hosts
  const knownHosts = [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'gitea.com',
    'codeberg.org',
  ];

  let parsedUrl: URL;

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      parsedUrl = new URL(url);
    } else if (knownHosts.some((host) => url.includes(host))) {
      parsedUrl = new URL(`https://${url}`);
    } else if (url.includes('/') && !url.includes('.')) {
      // Assume GitHub for user/repo format
      parsedUrl = new URL(`https://github.com/${url}`);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname;
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

  if (pathParts.length < 2) return null;

  const [owner, repo, ...rest] = pathParts;

  const result: ParsedRepo = {
    host: hostname,
    owner,
    repo: repo.replace(/\.git$/, ''),
  };

  // Parse tree/blob/branch from URL
  if (rest.length > 0) {
    const type = rest[0]; // 'tree', 'blob', '-', etc.

    if (type === 'tree' || type === 'blob' || type === '-') {
      result.branch = rest[1];

      if (rest.length > 2) {
        result.path = rest.slice(2).join('/');
      }
    }
  }

  return result;
}

function shouldIncludeFile(
  path: string,
  includePatterns?: string[],
  excludePatterns?: string[]
): boolean {
  // Check default ignore patterns
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    if (matchPattern(path, pattern)) {
      return false;
    }
  }

  // Check exclude patterns
  if (excludePatterns?.length) {
    for (const pattern of excludePatterns) {
      if (matchPattern(path, pattern)) {
        return false;
      }
    }
  }

  // Check include patterns
  if (includePatterns?.length) {
    return includePatterns.some((pattern) => matchPattern(path, pattern));
  }

  return true;
}

function matchPattern(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return (
    new RegExp(`^${regexPattern}$`).test(path) ||
    path.includes(pattern.replace(/\*/g, ''))
  );
}

function generateTree(
  files: Array<{ path: string; isDirectory: boolean }>,
  repoName: string
): string {
  const lines = ['Directory structure:', `└── ${repoName}/`];

  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });

  for (const file of sorted) {
    const depth = file.path.split('/').length;
    const indent = '    '.repeat(depth);
    const name = file.path.split('/').pop() || file.path;
    const suffix = file.isDirectory ? '/' : '';
    lines.push(`${indent}├── ${name}${suffix}`);
  }

  return lines.join('\n');
}

export async function ingestRepository(
  repoUrl: string,
  options: IngestOptions,
  onProgress?: (current: number, total: number) => void
): Promise<IngestResult> {
  const parsed = parseGitUrl(repoUrl);

  if (!parsed) {
    throw new Error('Invalid Git repository URL');
  }

  const { host, owner, repo, branch, path: subpath } = parsed;

  if (!host.includes('github')) {
    throw new Error('Only GitHub repositories are supported');
  }

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const branchName = branch || 'main';

  // Step 1: Get the default branch if not specified
  let actualBranch = branchName;
  if (!branch) {
    try {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
      );
      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        actualBranch = repoData.default_branch;
      }
    } catch {
      // Fallback to 'main'
    }
  }

  onProgress?.(10, 100);

  // Step 2: Get the tree SHA for the branch
  const refResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${actualBranch}`,
    { headers }
  );

  if (!refResponse.ok) {
    throw new Error(`Failed to fetch branch: ${refResponse.statusText}`);
  }

  const refData = await refResponse.json();
  const commitSha = refData.object.sha;

  onProgress?.(20, 100);

  // Step 3: Get recursive tree (ALL files in ONE request!)
  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
    { headers }
  );

  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch tree: ${treeResponse.statusText}`);
  }

  const treeData = await treeResponse.json();

  onProgress?.(40, 100);

  // Step 4: Filter files
  const filteredFiles = treeData.tree.filter((item: any) => {
    if (item.type !== 'blob') return false;

    const path = item.path;

    // Filter by subpath
    if (subpath && !path.startsWith(subpath)) return false;

    // Filter by size
    if (item.size > options.maxFileSize * 1024) return false;

    // Filter by patterns
    return shouldIncludeFile(
      path,
      options.includePatterns,
      options.excludePatterns
    );
  });

  const treeList: Array<{ path: string; isDirectory: boolean }> = [];

  // Add directories and files to tree
  treeData.tree.forEach((item: any) => {
    if (subpath && !item.path.startsWith(subpath)) return;

    if (item.type === 'tree') {
      treeList.push({ path: item.path, isDirectory: true });
    } else if (filteredFiles.find((f: any) => f.path === item.path)) {
      treeList.push({ path: item.path, isDirectory: false });
    }
  });

  onProgress?.(50, 100);

  // Step 5: Fetch file contents in parallel (with concurrency limit)
  const fileList: Array<{
    path: string;
    isDirectory: boolean;
    content?: string;
    size: number;
  }> = [];

  const CONCURRENT_DOWNLOADS = 5;

  for (let i = 0; i < filteredFiles.length; i += CONCURRENT_DOWNLOADS) {
    const batch = filteredFiles.slice(i, i + CONCURRENT_DOWNLOADS);

    const contents = await Promise.all(
      batch.map(async (file: any) => {
        try {
          // Use raw.githubusercontent.com (no CORS issues!)
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${actualBranch}/${file.path}`;

          const response = await fetch(rawUrl);

          if (!response.ok) {
            return {
              path: file.path,
              isDirectory: false,
              content: `[Failed to fetch: ${response.statusText}]`,
              size: file.size,
            };
          }

          const text = await response.text();

          return {
            path: file.path,
            isDirectory: false,
            content: text,
            size: file.size,
          };
        } catch (error) {
          return {
            path: file.path,
            isDirectory: false,
            content: '[Binary or failed to decode]',
            size: file.size,
          };
        }
      })
    );

    fileList.push(...contents);

    onProgress?.(
      50 + Math.floor(((i + batch.length) / filteredFiles.length) * 45),
      100
    );
  }

  onProgress?.(95, 100);

  // Generate tree
  const tree = generateTree(treeList, repo);

  // Generate content
  const contentParts: string[] = [];
  for (const file of fileList) {
    if (!file.isDirectory && file.content) {
      contentParts.push(
        SEPARATOR,
        `File: ${file.path}`,
        SEPARATOR,
        file.content,
        ''
      );
    }
  }
  const content = contentParts.join('\n');

  // Generate summary
  const fileCount = fileList.length;
  const totalSize = fileList.reduce((sum, f) => sum + f.size, 0);

  const summary = [
    `Repository: ${owner}/${repo}`,
    `Host: ${host}`,
    `Branch: ${actualBranch}`,
    `Files analyzed: ${fileCount}`,
    `Total size: ${(totalSize / 1024).toFixed(2)} KB`,
  ].join('\n');

  onProgress?.(100, 100);

  return {
    repo_url: repoUrl,
    short_repo_url: `${owner}/${repo}`,
    summary,
    tree,
    content,
  };
}
