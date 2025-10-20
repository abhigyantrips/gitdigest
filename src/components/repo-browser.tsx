import { FolderGit2, Loader2, Search } from 'lucide-react';

import { useEffect, useState } from 'react';

import { type Provider, fetchRepositories } from '@/lib/oauth';
import { getAllTokens } from '@/lib/storage';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Repo {
  id: string;
  name: string;
  fullName: string;
  url: string;
  cloneUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string;
}

interface RepoBrowserProps {
  onSelect: (repoUrl: string, branch: string) => void;
}

export function RepoBrowser({ onSelect }: RepoBrowserProps) {
  const [provider, setProvider] = useState<Provider | ''>('');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  const tokens = getAllTokens();
  const connectedProviders = Object.keys(tokens) as Provider[];

  useEffect(() => {
    if (connectedProviders.length === 1) {
      setProvider(connectedProviders[0]);
    }
  }, []);

  useEffect(() => {
    if (provider) {
      loadRepos();
    }
  }, [provider]);

  useEffect(() => {
    if (search) {
      setFilteredRepos(
        repos.filter((repo) =>
          repo.fullName.toLowerCase().includes(search.toLowerCase())
        )
      );
    } else {
      setFilteredRepos(repos);
    }
  }, [search, repos]);

  const loadRepos = async () => {
    if (!provider) return;

    setLoading(true);
    try {
      const tokenData = tokens[provider];
      const repositories = await fetchRepositories(provider, tokenData.token);
      setRepos(repositories);
      setFilteredRepos(repositories);
    } catch (error) {
      alert('Failed to load repositories');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (!selectedRepo) return;
    onSelect(selectedRepo.cloneUrl, selectedRepo.defaultBranch);
  };

  if (connectedProviders.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center">
        <FolderGit2 className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p className="font-medium">No accounts connected</p>
        <p className="text-sm">
          Connect a provider to browse your repositories
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={provider}
            onValueChange={(v) => setProvider(v as Provider)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {connectedProviders.map((p) => (
                <SelectItem key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)} (
                  {tokens[p].user.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Search Repositories</Label>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              disabled={!repos.length}
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading && filteredRepos.length > 0 && (
        <div className="space-y-2">
          <Label>Repository ({filteredRepos.length})</Label>
          <Select
            value={selectedRepo?.id || ''}
            onValueChange={(id) => {
              const repo = repos.find((r) => r.id === id);
              setSelectedRepo(repo || null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a repository" />
            </SelectTrigger>
            <SelectContent>
              {filteredRepos.map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>
                  <div className="flex items-center gap-2">
                    <span>{repo.fullName}</span>
                    {repo.isPrivate && (
                      <span className="text-muted-foreground text-xs">🔒</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedRepo && (
            <Button onClick={handleSelect} className="w-full">
              Use {selectedRepo.fullName}
            </Button>
          )}
        </div>
      )}

      {!loading && repos.length > 0 && filteredRepos.length === 0 && (
        <p className="text-muted-foreground text-center text-sm">
          No repositories match your search
        </p>
      )}
    </div>
  );
}
