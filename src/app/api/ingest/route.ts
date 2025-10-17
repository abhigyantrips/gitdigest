import { mkdtemp, readFile, readdir, rm, stat } from 'fs/promises';
import ignore from 'ignore';
import { tmpdir } from 'os';
import { join } from 'path';
import simpleGit from 'simple-git';

import { NextRequest, NextResponse } from 'next/server';

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

interface IngestRequest {
  repoUrl: string;
  maxFileSize: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  token?: string;
  branch?: string;
}

export const maxDuration = 60; // 60 seconds timeout

function parseGitUrl(
  url: string
): { owner: string; repo: string; provider: string; host: string } | null {
  try {
    const cleanUrl = url.replace(/\.git$/, '').trim();
    let parsedUrl: URL;

    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      parsedUrl = new URL(cleanUrl);
    } else if (cleanUrl.includes('/')) {
      parsedUrl = new URL(`https://${cleanUrl}`);
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
  } catch {
    return null;
  }
}

function buildCloneUrl(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;

  try {
    const url = new URL(
      repoUrl.startsWith('http') ? repoUrl : `https://${repoUrl}`
    );

    // Format based on provider
    if (url.hostname.includes('github')) {
      // GitHub: https://TOKEN@github.com/owner/repo.git
      url.username = token;
      url.password = '';
    } else if (url.hostname.includes('gitlab')) {
      // GitLab: https://oauth2:TOKEN@gitlab.com/owner/repo.git
      url.username = 'oauth2';
      url.password = token;
    } else if (url.hostname.includes('bitbucket')) {
      // Bitbucket: https://x-token-auth:TOKEN@bitbucket.org/owner/repo.git
      url.username = 'x-token-auth';
      url.password = token;
    } else {
      // Generic: TOKEN as username
      url.username = token;
      url.password = '';
    }

    return url.toString();
  } catch {
    return repoUrl;
  }
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const body: IngestRequest = await request.json();
    const {
      repoUrl,
      maxFileSize,
      includePatterns,
      excludePatterns,
      token,
      branch,
    } = body;

    // Parse repo info
    const repoInfo = parseGitUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json(
        { error: 'Invalid repository URL' },
        { status: 400 }
      );
    }

    // Create temp directory
    tempDir = await mkdtemp(join(tmpdir(), 'gitingest-'));

    // Configure Git
    const git = simpleGit({
      maxConcurrentProcesses: 1,
      timeout: { block: 50000 },
    });

    // Build clone URL with token
    const cloneUrl = buildCloneUrl(repoUrl, token);

    // Clone options
    const cloneOptions = ['--depth', '1'];
    if (branch) {
      cloneOptions.push('--branch', branch);
    }

    // Clone repository
    try {
      await git.clone(cloneUrl, tempDir, cloneOptions);
    } catch (error) {
      // Handle common Git errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('access denied')
      ) {
        return NextResponse.json(
          {
            error:
              'Authentication failed. Check your token and repository access.',
          },
          { status: 401 }
        );
      }

      if (
        errorMessage.includes('not found') ||
        errorMessage.includes('does not exist')
      ) {
        return NextResponse.json(
          { error: 'Repository not found. Check the URL and try again.' },
          { status: 404 }
        );
      }

      throw error;
    }

    // Set up ignore patterns
    const ig = ignore().add(DEFAULT_IGNORE_PATTERNS);
    if (excludePatterns?.length) {
      ig.add(excludePatterns);
    }

    // Read files recursively
    const fileList: Array<{ path: string; content: string; size: number }> = [];
    const treeList: Array<{ path: string; isDirectory: boolean }> = [];

    async function readDirRecursive(dir: string, relativePath = '') {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        // Skip .git directory
        if (relPath.startsWith('.git')) continue;

        // Skip if ignored
        if (ig.ignores(relPath)) continue;

        // Check include patterns if specified
        if (includePatterns?.length) {
          const matches = includePatterns.some((pattern) => {
            const regex = new RegExp(
              pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
            );
            return regex.test(relPath);
          });
          if (!matches) continue;
        }

        if (entry.isDirectory()) {
          treeList.push({ path: relPath, isDirectory: true });
          await readDirRecursive(fullPath, relPath);
        } else {
          const stats = await stat(fullPath);

          // Check file size
          if (stats.size > maxFileSize * 1024) continue;

          treeList.push({ path: relPath, isDirectory: false });

          try {
            const content = await readFile(fullPath, 'utf-8');
            fileList.push({
              path: relPath,
              content,
              size: stats.size,
            });
          } catch {
            // Binary file or encoding error
            fileList.push({
              path: relPath,
              content: '[Binary file]',
              size: stats.size,
            });
          }
        }
      }
    }

    await readDirRecursive(tempDir);

    // Generate tree
    const tree = generateTree(treeList, repoInfo.repo);

    // Generate content
    const SEPARATOR = '='.repeat(48);
    const contentParts: string[] = [];
    for (const file of fileList) {
      contentParts.push(
        SEPARATOR,
        `File: ${file.path}`,
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
      `Branch: ${branch || 'default'}`,
      `Files analyzed: ${fileList.length}`,
      `Total size: ${(totalSize / 1024).toFixed(2)} KB`,
    ].join('\n');

    return NextResponse.json({
      repo_url: repoUrl,
      short_repo_url: `${repoInfo.owner}/${repoInfo.repo}`,
      summary,
      tree,
      content,
    });
  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process repository',
      },
      { status: 500 }
    );
  } finally {
    // Clean up temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to clean up temp dir:', e);
      }
    }
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
