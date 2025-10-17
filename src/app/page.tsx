'use client';

import { Suspense, useEffect, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { ingestRepository } from '@/lib/ingest';
import { estimateTokens } from '@/lib/tokenizer';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface IngestResult {
  repo_url: string;
  short_repo_url: string;
  summary: string;
  tree: string;
  content: string;
}

function logSliderToSize(position: number): number {
  const maxPosition = 500;
  const maxValue = Math.log(102400);
  const value = Math.exp(maxValue * Math.pow(position / maxPosition, 1.5));
  return Math.round(value);
}

function formatSize(sizeInKB: number): string {
  if (sizeInKB >= 1024) {
    return `${Math.round(sizeInKB / 1024)}MB`;
  }
  return `${Math.round(sizeInKB)}KB`;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const urlParam = searchParams?.get('url');

  const [inputText, setInputText] = useState('');
  const [sliderPosition, setSliderPosition] = useState(243);
  const [maxFileSize, setMaxFileSize] = useState(logSliderToSize(243));
  const [patternType, setPatternType] = useState('exclude');
  const [pattern, setPattern] = useState('');
  const [branch, setBranch] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState<IngestResult | null>(null);
  const [tokenCount, setTokenCount] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(false);

  useEffect(() => {
    // Check for hash-based URL
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashUrl = window.location.hash.slice(1);
      if (hashUrl && !autoSubmit) {
        setInputText(decodeURIComponent(hashUrl));
        setAutoSubmit(true);
        setTimeout(() => {
          document.querySelector('form')?.requestSubmit();
        }, 100);
        return;
      }
    }

    // Check for query param
    if (urlParam && !autoSubmit) {
      setInputText(urlParam);
      setAutoSubmit(true);
      setTimeout(() => {
        document.querySelector('form')?.requestSubmit();
      }, 100);
    }
  }, [urlParam, autoSubmit]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = Number(e.target.value);
    setSliderPosition(position);
    setMaxFileSize(logSliderToSize(position));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setTokenCount(null);
    setProgress(0);
    setProgressText('Starting ingestion...');

    try {
      const patterns = pattern
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      const options = {
        maxFileSize,
        token: isPrivate && token ? token : undefined,
        isPrivate,
        branch: branch || undefined,
        ...(patternType === 'include'
          ? { includePatterns: patterns }
          : { excludePatterns: patterns }),
      };

      const data = await ingestRepository(
        inputText,
        options,
        (current, total) => {
          setProgress((current / total) * 100);

          if (current < 20) {
            setProgressText('Connecting to repository...');
          } else if (current < 50) {
            setProgressText('Cloning repository...');
          } else if (current < 80) {
            setProgressText('Processing files...');
          } else {
            setProgressText('Finalizing...');
          }
        }
      );

      setResult(data);

      const textToTokenize = `${data.tree}\n${data.content}`;
      const tokens = estimateTokens(textToTokenize);
      setTokenCount(tokens);

      // Update URL hash for sharing
      if (typeof window !== 'undefined') {
        window.location.hash = encodeURIComponent(inputText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressText('');
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-4xl font-bold">GitIngest</h1>
      <p className="text-muted-foreground mb-8">
        Generate AI-ready digests from any Git repository
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Repository Ingestion</CardTitle>
          <CardDescription>
            Supports GitHub, GitLab, Bitbucket, Gitea, and Codeberg
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                type="text"
                placeholder="https://github.com/user/repo or user/repo"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch">Branch (optional)</Label>
                <Input
                  id="branch"
                  type="text"
                  placeholder="main, master, dev..."
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file-size">
                  Max file size:{' '}
                  <span className="font-bold">{formatSize(maxFileSize)}</span>
                </Label>
                <input
                  type="range"
                  id="file-size"
                  min="1"
                  max="500"
                  value={sliderPosition}
                  onChange={handleSliderChange}
                  disabled={loading}
                  className="h-3 w-full appearance-none rounded-sm border-2 border-gray-900 bg-gradient-to-r from-red-500 to-red-500 focus:outline-none disabled:opacity-50 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[3px_3px_0_#000]"
                  style={{
                    backgroundSize: `${(sliderPosition / 500) * 100}% 100%`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pattern-type">Pattern Type</Label>
                <Select
                  value={patternType}
                  onValueChange={setPatternType}
                  disabled={loading}
                >
                  <SelectTrigger id="pattern-type">
                    <SelectValue placeholder="Select pattern type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclude">Exclude</SelectItem>
                    <SelectItem value="include">Include</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pattern">Patterns (comma-separated)</Label>
                <Input
                  id="pattern"
                  type="text"
                  placeholder="*.log, test/*, docs/*"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="private-repo"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  disabled={loading}
                  className="border-input h-4 w-4 rounded"
                />
                <Label htmlFor="private-repo" className="cursor-pointer">
                  Private repository (requires access token)
                </Label>
              </div>
            </div>

            {isPrivate && (
              <div className="space-y-2">
                <Label htmlFor="token">Personal Access Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="GitHub: ghp_xxx | GitLab: glpat-xxx | Bitbucket: App password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={loading}
                />
                <p className="text-muted-foreground text-xs">
                  Get your token:{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline"
                  >
                    GitHub
                  </a>
                  {' | '}
                  <a
                    href="https://gitlab.com/-/profile/personal_access_tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline"
                  >
                    GitLab
                  </a>
                  {' | '}
                  <a
                    href="https://bitbucket.org/account/settings/app-passwords/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline"
                  >
                    Bitbucket
                  </a>
                </p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Processing...' : 'Ingest Repository'}
            </Button>

            {loading && progressText && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-muted-foreground text-center text-sm">
                  {progressText}
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && <ResultsSection result={result} tokenCount={tokenCount} />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}

function ResultsSection({
  result,
  tokenCount,
}: {
  result: IngestResult;
  tokenCount: string | null;
}) {
  const copyToClipboard = async (text: string, buttonId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      const button = document.getElementById(buttonId);
      if (button) {
        const originalText = button.innerHTML;
        button.innerHTML = 'Copied!';
        setTimeout(() => {
          button.innerHTML = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyAll = () => {
    const fullDigest = `${result.tree}\n\n${result.content}`;
    copyToClipboard(fullDigest, 'copy-all-btn');
  };

  const downloadDigest = () => {
    const fullDigest = `${result.tree}\n\n${result.content}`;
    const blob = new Blob([fullDigest], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.short_repo_url.replace('/', '-')}-digest.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryWithTokens = tokenCount
    ? `${result.summary}\nEstimated tokens: ${tokenCount}`
    : result.summary;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-auto rounded-lg p-4 text-sm">
            {summaryWithTokens}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Directory Structure</CardTitle>
          <Button
            id="copy-tree-btn"
            onClick={() => copyToClipboard(result.tree, 'copy-tree-btn')}
            variant="outline"
            size="sm"
          >
            Copy
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted max-h-96 overflow-auto rounded-lg p-4 text-sm">
            {result.tree}
          </pre>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button
          id="copy-all-btn"
          onClick={copyAll}
          variant="secondary"
          className="flex-1"
        >
          Copy All
        </Button>
        <Button onClick={downloadDigest} variant="secondary" className="flex-1">
          Download
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Files Content</CardTitle>
          <Button
            id="copy-content-btn"
            onClick={() => copyToClipboard(result.content, 'copy-content-btn')}
            variant="outline"
            size="sm"
          >
            Copy
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={result.content}
            className="h-96 font-mono text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
}
