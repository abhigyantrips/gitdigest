import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

export interface CloneConfig {
  url: string;
  branch?: string;
  commit?: string;
  token?: string;
  localPath: string;
}

export async function cloneRepository(config: CloneConfig): Promise<string> {
  const git: SimpleGit = simpleGit();
  
  // Add authentication if token provided
  let authUrl = config.url;
  if (config.token && config.url.includes('github.com')) {
    authUrl = config.url.replace(
      'https://',
      `https://x-oauth-basic:${config.token}@`
    );
  }
  
  // Build clone options as array
  const cloneOptions: string[] = [
    '--depth=1',
    '--single-branch',
  ];
  
  if (config.branch) {
    cloneOptions.push(`--branch=${config.branch}`);
  }
  
  // Clone repository
  await git.clone(authUrl, config.localPath, cloneOptions);
  
  // Checkout specific commit if provided
  if (config.commit) {
    const repoGit = simpleGit(config.localPath);
    await repoGit.checkout(config.commit);
  }
  
  return config.localPath;
}

export function createTempDir(): string {
  const tempPath = path.join(tmpdir(), `gitingest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return tempPath;
}

export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup temp directory:', error);
  }
}