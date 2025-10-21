import * as LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import ignore from 'ignore';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

// Make sure Buffer is globally available
if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer;
}

const FS = (LightningFS as any).default || LightningFS;

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
  'pnpm-lock.yaml',
  'yarn.lock',
  '.pnpm-store',
  'bun.lock',
  'poetry.lock',
];

// CORS proxies for different scenarios
const CORS_PROXIES = {
  default: 'https://cors.isomorphic-git.org',
  alternative: 'https://cors-anywhere.herokuapp.com',
};

interface IngestOptions {
  maxFileSize: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  token?: string;
  isPrivate?: boolean;
  branch?: string;
  corsProxy?: string;
}

interface IngestResult {
  repo_url: string;
  short_repo_url: string;
  summary: string;
  tree: string;
  content: string;
  treeEntries: Array<{ path: string; isDirectory: boolean }>;
}

interface RepoInfo {
  owner: string;
  repo: string;
  provider: string;
  host: string;
}

function parseGitUrl(url: string): RepoInfo | null {
  try {
    const cleanUrl = url.replace(/\.git$/, '').trim();
    let parsedUrl: URL;

    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      parsedUrl = new URL(cleanUrl);
    } else if (cleanUrl.includes('/')) {
      // Handle short format: owner/repo or github.com/owner/repo
      if (!cleanUrl.includes('.')) {
        // Just owner/repo, assume GitHub
        parsedUrl = new URL(`https://github.com/${cleanUrl}`);
      } else {
        parsedUrl = new URL(`https://${cleanUrl}`);
      }
    } else {
      return null;
    }

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return null;

    const [owner, repo] = pathParts;
    const hostname = parsedUrl.hostname;

    let provider = 'unknown';
    if (hostname.includes('github')) provider = 'github';
    else if (hostname.includes('gitlab')) provider = 'gitlab';
    else if (hostname.includes('bitbucket')) provider = 'bitbucket';
    else if (hostname.includes('gitea')) provider = 'gitea';
    else if (hostname.includes('codeberg')) provider = 'codeberg';

    return {
      owner,
      repo: repo.replace(/\.git$/, ''),
      provider,
      host: hostname,
    };
  } catch (e) {
    console.error('URL parsing error:', e);
    return null;
  }
}

function buildCloneUrl(repoUrl: string): string {
  // Check for short format first (owner/repo without domain)
  if (
    !repoUrl.startsWith('http') &&
    repoUrl.includes('/') &&
    !repoUrl.includes('.')
  ) {
    return `https://github.com/${repoUrl}`;
  }

  // If it doesn't start with http/https, prepend https://
  if (!repoUrl.startsWith('http')) {
    return `https://${repoUrl}`;
  }

  return repoUrl;
}

export async function ingestRepositoryClient(
  repoUrl: string,
  options: IngestOptions,
  onProgress?: (current: number, total: number) => void
): Promise<IngestResult> {
  const repoInfo = parseGitUrl(repoUrl);
  if (!repoInfo) {
    throw new Error(
      'Invalid repository URL. Use format: owner/repo or https://github.com/owner/repo'
    );
  }

  onProgress?.(5, 100);

  // Initialize filesystem with unique name to avoid conflicts
  const fsName = `gitingest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const fs = new FS(fsName); // Changed: use FS directly
  const pfs = fs.promises; // Get promises interface
  const dir = `/repo`;

  const cloneUrl = buildCloneUrl(repoUrl);

  // Determine CORS proxy
  const corsProxy = options.corsProxy || CORS_PROXIES.default;

  try {
    onProgress?.(10, 100);

    console.log(`🌐 Cloning ${cloneUrl}...`);
    console.log(`🔒 CORS Proxy: ${corsProxy}`);

    // Clone repository
    await git.clone({
      fs,
      http,
      dir,
      url: cloneUrl,
      ref: options.branch,
      singleBranch: true,
      depth: 1,
      corsProxy,
      ...(options.token && {
        onAuth: () => ({
          username: options.token!,
          password: '',
        }),
      }),
      onProgress: (event) => {
        // Git clone progress
        if (event.phase === 'Receiving objects') {
          const progress = 10 + (event.loaded / event.total) * 30;
          onProgress?.(progress, 100);
        }
      },
    });

    console.log('✅ Clone successful');
    onProgress?.(45, 100);

    // Set up ignore patterns
    const ig = ignore().add(DEFAULT_IGNORE_PATTERNS);
    if (options.excludePatterns?.length) {
      ig.add(options.excludePatterns);
    }

    const fileList: Array<{ path: string; content: string; size: number }> = [];
    const treeList: Array<{ path: string; isDirectory: boolean }> = [];

    let filesProcessed = 0;
    let totalFiles = 0;

    // Count files first
    async function countFiles(currentDir: string): Promise<number> {
      let count = 0;
      try {
        const entries = await pfs.readdir(currentDir);
        for (const entry of entries) {
          const fullPath = `${currentDir}/${entry}`;
          const stats = await pfs.stat(fullPath);
          if (stats.isDirectory() && entry !== '.git') {
            count += await countFiles(fullPath);
          } else if (!entry.startsWith('.git')) {
            count++;
          }
        }
      } catch {}
      return count;
    }

    totalFiles = await countFiles(dir);
    console.log(`📁 Total files found: ${totalFiles}`);

    // Read files recursively
    async function readDirRecursive(
      currentDir: string,
      relativePath = ''
    ): Promise<void> {
      let entries: string[];
      try {
        entries = await pfs.readdir(currentDir);
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = `${currentDir}/${entry}`;
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;

        // Skip .git directory
        if (relPath.startsWith('.git')) continue;

        // Skip if ignored
        if (ig.ignores(relPath)) continue;

        // Check include patterns if specified
        if (options.includePatterns?.length) {
          const matches = options.includePatterns.some((pattern) => {
            const regex = new RegExp(
              pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
            );
            return regex.test(relPath);
          });
          if (!matches) continue;
        }

        let stats;
        try {
          stats = await pfs.stat(fullPath);
        } catch {
          continue;
        }

        if (stats.isDirectory()) {
          treeList.push({ path: relPath, isDirectory: true });
          await readDirRecursive(fullPath, relPath);
        } else {
          filesProcessed++;
          const progress = 45 + (filesProcessed / totalFiles) * 45;
          onProgress?.(progress, 100);

          // Check file size
          if (stats.size > options.maxFileSize * 1024) {
            console.log(
              `⏭️  Skipping large file: ${relPath} (${stats.size} bytes)`
            );
            continue;
          }

          treeList.push({ path: relPath, isDirectory: false });

          try {
            const buffer = await pfs.readFile(fullPath);
            const content = new TextDecoder('utf-8', { fatal: true }).decode(
              buffer
            );
            fileList.push({
              path: relPath,
              content,
              size: stats.size,
            });
          } catch {
            // Binary file or encoding error
            fileList.push({
              path: relPath,
              content: '[Binary file - content not included]',
              size: stats.size,
            });
          }
        }
      }
    }

    await readDirRecursive(dir);

    console.log(`✅ Processed ${fileList.length} files`);
    onProgress?.(95, 100);

    // Generate tree
    const tree = generateTree(treeList, repoInfo.repo);

    // Generate content
    const SEPARATOR = '='.repeat(48);
    const contentParts: string[] = [];
    for (const file of fileList) {
      contentParts.push(
        SEPARATOR,
        `FILE: ${file.path}`,
        SEPARATOR,
        file.content,
        ''
      );
    }
    const content = contentParts.join('\n');

    // Summary
    const totalSize = fileList.reduce((sum, f) => sum + f.size, 0);
    const summary = [
      `Repository: ${repoInfo.owner}/${repoInfo.repo}`,
      `Provider: ${repoInfo.provider}`,
      `Host: ${repoInfo.host}`,
      `Branch: ${options.branch || 'default'}`,
      `Files analyzed: ${fileList.length}`,
      `Total size: ${(totalSize / 1024).toFixed(2)} KB`,
      `Mode: Client-side (browser)`,
    ].join('\n');

    onProgress?.(100, 100);

    // Cleanup filesystem
    try {
      await pfs.rmdir(dir, { recursive: true });
      console.log('🧹 Cleaned up filesystem');
    } catch (e) {
      console.warn('⚠️  Cleanup warning:', e);
    }

    return {
      repo_url: repoUrl,
      short_repo_url: `${repoInfo.owner}/${repoInfo.repo}`,
      summary,
      tree,
      content,
      treeEntries: treeList,
    };
  } catch (error) {
    // Cleanup on error
    try {
      await pfs.rmdir(dir, { recursive: true });
    } catch {}

    // Enhanced error messages
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('CORS') || errorMessage.includes('cors')) {
      throw new Error(
        `CORS Error: Unable to access repository. This usually happens with:\n\n` +
          `• Private repositories (try adding your access token)\n` +
          `• Some GitLab/Bitbucket instances\n` +
          `• Self-hosted Git servers\n\n` +
          `Solutions:\n` +
          `1. Make sure the repository is public\n` +
          `2. Add a personal access token if it's private\n` +
          `3. Try a different CORS proxy (advanced users)`
      );
    }

    if (
      errorMessage.includes('401') ||
      errorMessage.includes('authentication')
    ) {
      throw new Error(
        'Authentication failed. Please check:\n\n' +
          '• Your access token is correct\n' +
          '• The token has read access to the repository\n' +
          '• The repository exists and you have permission'
      );
    }

    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      throw new Error(
        'Repository not found. Please check:\n\n' +
          '• The URL is correct\n' +
          '• The repository exists\n' +
          '• You have access to view it'
      );
    }

    throw new Error(`Failed to clone repository: ${errorMessage}`);
  }
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
