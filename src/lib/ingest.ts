import fs from 'fs/promises';
import path from 'path';
import ignore, { Ignore } from 'ignore';
import { glob } from 'glob';

export interface IngestOptions {
  maxFileSize: number; // bytes
  includePatterns?: string[];
  excludePatterns?: string[];
  respectGitignore?: boolean;
}

export interface IngestResult {
  summary: string;
  tree: string;
  content: string;
}

interface FileNode {
  path: string;
  relativePath: string;
  content?: string;
  isDirectory: boolean;
  size?: number;
}

export async function ingestRepository(
  repoPath: string,
  options: IngestOptions
): Promise<IngestResult> {
  // Load .gitignore patterns
  const ig = await loadGitignore(repoPath, options.respectGitignore);
  
  // Scan files
  const files = await scanDirectory(repoPath, repoPath, ig, options);
  
  // Generate tree
  const tree = generateTree(files, repoPath);
  
  // Generate content
  const content = await generateContent(files, options.maxFileSize);
  
  // Generate summary
  const summary = generateSummary(files, content);
  
  return { summary, tree, content };
}

async function loadGitignore(
  repoPath: string,
  respectGitignore: boolean = true
): Promise<Ignore> {
  const ig = ignore();
  
  if (!respectGitignore) return ig;
  
  try {
    const gitignorePath = path.join(repoPath, '.gitignore');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    // No .gitignore found
  }
  
  // Always ignore .git
  ig.add('.git');
  
  return ig;
}

async function scanDirectory(
  dirPath: string,
  rootPath: string,
  ig: Ignore,
  options: IngestOptions
): Promise<FileNode[]> {
  const files: FileNode[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);
    
    // Check gitignore
    if (ig.ignores(relativePath)) continue;
    
    // Check exclude patterns
    if (options.excludePatterns?.some(pattern => 
      matchPattern(relativePath, pattern)
    )) continue;
    
    // Check include patterns
    if (options.includePatterns && !options.includePatterns.some(pattern =>
      matchPattern(relativePath, pattern)
    )) continue;
    
    if (entry.isDirectory()) {
      files.push({
        path: fullPath,
        relativePath,
        isDirectory: true,
      });
      
      // Recurse
      const subFiles = await scanDirectory(fullPath, rootPath, ig, options);
      files.push(...subFiles);
    } else {
      const stats = await fs.stat(fullPath);
      
      if (stats.size > options.maxFileSize) continue;
      
      files.push({
        path: fullPath,
        relativePath,
        isDirectory: false,
        size: stats.size,
      });
    }
  }
  
  return files;
}

function matchPattern(filePath: string, pattern: string): boolean {
  // Simple glob matching (use minimatch for production)
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(filePath);
}

function generateTree(files: FileNode[], rootPath: string): string {
  const lines: string[] = ['Directory structure:'];
  
  // Sort: directories first, then files
  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
  
  for (const file of sorted) {
    const depth = file.relativePath.split(path.sep).length - 1;
    const indent = '  '.repeat(depth);
    const prefix = depth > 0 ? '├── ' : '';
    const name = path.basename(file.relativePath);
    const suffix = file.isDirectory ? '/' : '';
    
    lines.push(`${indent}${prefix}${name}${suffix}`);
  }
  
  return lines.join('\n');
}

async function generateContent(
  files: FileNode[],
  maxFileSize: number
): Promise<string> {
  const contentParts: string[] = [];
  
  for (const file of files) {
    if (file.isDirectory) continue;
    
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      
      contentParts.push(
        '='.repeat(48),
        `FILE: ${file.relativePath}`,
        '='.repeat(48),
        content,
        ''
      );
    } catch (err) {
      // Binary file or read error
      contentParts.push(
        '='.repeat(48),
        `FILE: ${file.relativePath}`,
        '='.repeat(48),
        '[Binary file or read error]',
        ''
      );
    }
  }
  
  return contentParts.join('\n');
}

function generateSummary(files: FileNode[], content: string): string {
  const fileCount = files.filter(f => !f.isDirectory).length;
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  
  // Rough token estimation (4 chars ≈ 1 token)
  const estimatedTokens = Math.round(content.length / 4);
  
  return [
    `Files analyzed: ${fileCount}`,
    `Total size: ${(totalSize / 1024).toFixed(2)} KB`,
    `Estimated tokens: ${estimatedTokens.toLocaleString()}`,
  ].join('\n');
}