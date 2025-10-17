'use client';

interface IngestOptions {
  maxFileSize: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  token?: string;
  isPrivate?: boolean;
  branch?: string;
}

interface IngestResult {
  repo_url: string;
  short_repo_url: string;
  summary: string;
  tree: string;
  content: string;
}

export async function ingestRepository(
  repoUrl: string,
  options: IngestOptions,
  onProgress?: (current: number, total: number) => void
): Promise<IngestResult> {
  onProgress?.(10, 100);

  try {
    const response = await fetch('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repoUrl,
        maxFileSize: options.maxFileSize,
        includePatterns: options.includePatterns,
        excludePatterns: options.excludePatterns,
        token: options.token,
        branch: options.branch,
      }),
    });

    onProgress?.(40, 100);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Server error: ${response.status}`);
    }

    onProgress?.(70, 100);

    const data = await response.json();

    onProgress?.(100, 100);

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to ingest repository');
  }
}
