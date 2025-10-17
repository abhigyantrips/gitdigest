'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface IngestResult {
  repo_url: string;
  short_repo_url: string;
  summary: string;
  tree: string;
  content: string;
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [maxFileSize, setMaxFileSize] = useState(5);
  const [patternType, setPatternType] = useState('exclude');
  const [pattern, setPattern] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_text: inputText,
          max_file_size: maxFileSize * 1024 * 1024,
          pattern_type: patternType,
          pattern,
          token: token || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ingestion failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">GitIngest</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Repository Ingestion</CardTitle>
          <CardDescription>Enter a GitHub repository URL to generate a digest</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                type="text"
                placeholder="https://github.com/user/repo"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-file-size">Max File Size (MB)</Label>
                <Input
                  id="max-file-size"
                  type="number"
                  value={maxFileSize}
                  onChange={(e) => setMaxFileSize(Number(e.target.value))}
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pattern-type">Pattern Type</Label>
                <Select value={patternType} onValueChange={setPatternType}>
                  <SelectTrigger id="pattern-type">
                    <SelectValue placeholder="Select pattern type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclude">Exclude</SelectItem>
                    <SelectItem value="include">Include</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pattern">Patterns</Label>
              <Input
                id="pattern"
                type="text"
                placeholder="e.g., *.log, node_modules"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">GitHub Token (optional)</Label>
              <Input
                id="token"
                type="password"
                placeholder="For private repositories"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Processing...' : 'Ingest Repository'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {result.summary}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Directory Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-sm">
                {result.tree}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Files Content</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                readOnly
                value={result.content}
                className="h-96 font-mono text-sm"
              />
            </CardContent>
          </Card>

          <Button
            onClick={() => {
              const blob = new Blob([result.tree + '\n\n' + result.content], {
                type: 'text/plain',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${result.short_repo_url.replace('/', '-')}-digest.txt`;
              a.click();
            }}
            variant="secondary"
            className="w-full"
          >
            Download Digest
          </Button>
        </div>
      )}
    </div>
  );
}