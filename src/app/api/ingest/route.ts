import { NextRequest, NextResponse } from 'next/server';
import { cloneRepository, createTempDir } from '@/lib/git';
import { ingestRepository } from '@/lib/ingest';
import { parseGitUrl } from '@/lib/parser';
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  
  try {
    const body = await request.json();
    const {
      input_text,
      max_file_size = 5 * 1024 * 1024, // 5MB default
      pattern_type = 'exclude',
      pattern = '',
      token,
    } = body;
    
    // Parse repository URL
    const parsed = parseGitUrl(input_text);
    const repoUrl = `https://${parsed.host}/${parsed.owner}/${parsed.repo}`;
    
    // Create temp directory
    tempDir = createTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    
    // Clone repository
    await cloneRepository({
      url: repoUrl,
      branch: parsed.branch,
      token,
      localPath: tempDir,
    });
    
    // Process patterns
    const patterns = pattern
      .split(',')
      .map((p: string) => p.trim())
      .filter(Boolean);
    
    const options = {
      maxFileSize: max_file_size,
      respectGitignore: true,
      ...(pattern_type === 'include'
        ? { includePatterns: patterns }
        : { excludePatterns: patterns }
      ),
    };
    
    // Ingest repository
    const result = await ingestRepository(tempDir, options);
    
    return NextResponse.json({
      repo_url: input_text,
      short_repo_url: `${parsed.owner}/${parsed.repo}`,
      ...result,
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}