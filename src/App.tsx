import {
  Check,
  Clipboard,
  FileText,
  GitCompare,
  Heart,
  Lightbulb,
  Rocket,
  Save,
} from 'lucide-react';

import { useEffect, useState } from 'react';

import { ingestRepositoryClient } from '@/lib/ingest';
import { estimateTokens } from '@/lib/tokenizer';

import { Header } from '@/components/header';
import { ThemeProvider } from '@/components/theme-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from '@/components/ui/tree';

interface IngestResult {
  repo_url: string;
  short_repo_url: string;
  summary: string;
  tree: string;
  content: string;
  treeEntries?: Array<{ path: string; isDirectory: boolean }>;
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

function App() {
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

  useEffect(() => {
    // Check for hash-based URL
    if (window.location.hash) {
      const hashUrl = window.location.hash.slice(1);
      if (hashUrl) {
        setInputText(decodeURIComponent(hashUrl));
        setTimeout(() => {
          document.querySelector('form')?.requestSubmit();
        }, 100);
      }
    }

    // Check for query param
    const urlParams = new URLSearchParams(window.location.search);
    const urlParam = urlParams.get('url');
    if (urlParam) {
      setInputText(urlParam);
      setTimeout(() => {
        document.querySelector('form')?.requestSubmit();
      }, 100);
    }
  }, []);

  // Slider handled via shadcn Slider onValueChange

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

      const data = await ingestRepositoryClient(
        inputText,
        options,
        (current, total) => {
          setProgress((current / total) * 100);

          if (current < 15) {
            setProgressText('Connecting to repository...');
          } else if (current < 50) {
            setProgressText('Cloning repository...');
          } else if (current < 90) {
            setProgressText('Processing files...');
          } else {
            setProgressText('Finalizing digest...');
          }
        }
      );

      setResult(data);

      const textToTokenize = `${data.tree}\n${data.content}`;
      const tokens = estimateTokens(textToTokenize);
      setTokenCount(tokens);

      // Update URL hash
      window.location.hash = encodeURIComponent(inputText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressText('');
    }
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="gitdigest-theme">
      <div>
        <Header />
        <div className="mx-auto max-w-4xl p-8">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Repository Ingestion</CardTitle>
              <CardDescription>
                Supports GitHub, GitLab, Bitbucket, Gitea, and Codeberg.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="repo-url">Repository URL</Label>
                  <Input
                    id="repo-url"
                    type="text"
                    placeholder="user/repo OR https://github.com/user/repo"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <p className="text-muted-foreground text-xs">
                    <Lightbulb className="inline-block h-4 w-4" /> Tip: Use
                    short format (e.g., "facebook/react") or full URL
                  </p>
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
                      <span className="font-bold">
                        {formatSize(maxFileSize)}
                      </span>
                    </Label>
                    <Slider
                      min={1}
                      max={500}
                      value={[sliderPosition]}
                      onValueChange={(vals) => {
                        const position = Number(vals[0] ?? 1);
                        setSliderPosition(position);
                        setMaxFileSize(logSliderToSize(position));
                      }}
                      disabled={loading}
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
                      <SelectTrigger id="pattern-type" className="w-full">
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
                    <Checkbox
                      id="private-repo"
                      checked={isPrivate}
                      onCheckedChange={(v) => setIsPrivate(Boolean(v))}
                      disabled={loading}
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
                      placeholder="GitHub: ghp_xxx | GitLab: glpat-xxx"
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
                      . Your token never leaves your browser.
                    </p>
                  </div>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Rocket className="inline-block h-4 w-4" /> Ingest
                      Repository
                    </>
                  )}
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
              <AlertDescription className="whitespace-pre-line">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {result && <ResultsSection result={result} tokenCount={tokenCount} />}

          <footer className="text-muted-foreground mt-12 border-t pt-6 text-center text-sm">
            <p>
              Built with{' '}
              <Heart className="inline-block h-4 w-4 align-middle text-red-500" />{' '}
              using{' '}
              <a
                href="https://isomorphic-git.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                isomorphic-git
              </a>
            </p>
            <p className="mt-2">
              ⭐ Your data never leaves your browser • No servers • Fully open
              source
            </p>
          </footer>
        </div>
      </div>
    </ThemeProvider>
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
        button.innerHTML = '✅ Copied!';
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
    <main>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <Check className="inline-block h-4 w-4" /> Digest Generated
              Successfully
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-auto rounded-lg p-4 text-sm">
              {summaryWithTokens}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              <FileText className="inline-block h-4 w-4" /> Directory Structure
            </CardTitle>
            <Button
              id="copy-tree-btn"
              onClick={() => copyToClipboard(result.tree, 'copy-tree-btn')}
              variant="outline"
              size="sm"
            >
              Copy Text
            </Button>
          </CardHeader>
          <CardContent>
            {result.treeEntries && result.treeEntries.length > 0 ? (
              (() => {
                type Node = {
                  name: string;
                  children?: Record<string, Node>;
                  isDirectory: boolean;
                };
                const root: Record<string, Node> = {};
                for (const entry of result.treeEntries!) {
                  const parts = entry.path.split('/');
                  let current = root;
                  parts.forEach((part, idx) => {
                    const isLast = idx === parts.length - 1;
                    if (!current[part]) {
                      current[part] = {
                        name: part,
                        isDirectory: !isLast || entry.isDirectory,
                      };
                    }
                    if (!isLast) {
                      current[part].children = current[part].children || {};
                      current = current[part].children!;
                    }
                  });
                }

                // Collect all nodeIds for expansion, including root
                const allNodeIds: string[] = ['root'];
                const collectNodeIds = (
                  nodes: Record<string, Node>,
                  level = 1
                ) => {
                  Object.entries(nodes).forEach(([key, item], idx) => {
                    const nodeId = `${level}-${key}-${idx}`;
                    allNodeIds.push(nodeId);
                    if (item.isDirectory && item.children) {
                      collectNodeIds(item.children, level + 1);
                    }
                  });
                };
                collectNodeIds(root, 1);

                const renderNodes = (
                  nodes: Record<string, Node>,
                  level = 1
                ) => {
                  const entries = Object.entries(nodes).sort(
                    ([aName, a], [bName, b]) => {
                      if (a.isDirectory !== b.isDirectory)
                        return a.isDirectory ? -1 : 1;
                      return aName.localeCompare(bName);
                    }
                  );
                  return entries.map(([key, item], idx) => {
                    const hasChildren =
                      !!item.children && Object.keys(item.children).length > 0;
                    const isLast = idx === entries.length - 1;
                    const nodeId = `${level}-${key}-${idx}`;
                    return (
                      <TreeNode
                        key={nodeId}
                        nodeId={nodeId}
                        level={level}
                        isLast={isLast}
                      >
                        <TreeNodeTrigger>
                          <TreeExpander
                            hasChildren={item.isDirectory && hasChildren}
                          />
                          <TreeIcon
                            hasChildren={item.isDirectory}
                            className={
                              item.isDirectory
                                ? 'text-yellow-500'
                                : 'text-muted-foreground'
                            }
                          />
                          <TreeLabel>{item.name}</TreeLabel>
                        </TreeNodeTrigger>
                        {item.isDirectory && hasChildren && (
                          <TreeNodeContent hasChildren>
                            {renderNodes(item.children!, level + 1)}
                          </TreeNodeContent>
                        )}
                      </TreeNode>
                    );
                  });
                };

                // Root node label and icon
                const repoName = result.short_repo_url.split('/')[1] || 'repo';
                return (
                  <TreeProvider defaultExpandedIds={['root', ...allNodeIds]}>
                    <TreeView className="bg-muted/20 max-h-96 overflow-auto rounded-lg">
                      <TreeNode nodeId="root" level={0}>
                        <TreeNodeTrigger>
                          {/* Orange git icon for root */}
                          <GitCompare className="mr-2 h-4 w-4 text-orange-500" />
                          <TreeLabel>{repoName}</TreeLabel>
                        </TreeNodeTrigger>
                        <TreeNodeContent hasChildren>
                          {renderNodes(root, 1)}
                        </TreeNodeContent>
                      </TreeNode>
                    </TreeView>
                  </TreeProvider>
                );
              })()
            ) : (
              <pre className="bg-muted max-h-96 overflow-auto rounded-lg p-4 text-sm">
                {result.tree}
              </pre>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            id="copy-all-btn"
            onClick={copyAll}
            variant="secondary"
            className="flex-1"
          >
            <Clipboard className="inline-block h-4 w-4" /> Copy All
          </Button>
          <Button
            onClick={downloadDigest}
            variant="secondary"
            className="flex-1"
          >
            <Save className="inline-block h-4 w-4" /> Download
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              <FileText className="inline-block h-4 w-4" /> Files Content
            </CardTitle>
            <Button
              id="copy-content-btn"
              onClick={() =>
                copyToClipboard(result.content, 'copy-content-btn')
              }
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
    </main>
  );
}

export default App;
