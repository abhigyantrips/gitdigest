import { Check, GitlabIcon as GitLab, Github, X } from 'lucide-react';

import { useEffect, useState } from 'react';

import { type Provider, isOAuthConfigured, startOAuthFlow } from '@/lib/oauth';
import {
  type TokenData,
  getAllTokens,
  hasAnyTokens,
  removeToken,
} from '@/lib/storage';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface AccountSheetProps {
  onClose: () => void;
}

const PROVIDERS = [
  {
    id: 'github' as Provider,
    name: 'GitHub',
    icon: Github,
    color: 'text-gray-900 dark:text-white',
  },
  {
    id: 'gitlab' as Provider,
    name: 'GitLab',
    icon: GitLab,
    color: 'text-orange-600',
  },
] as const;

export function AccountSheet({ onClose }: AccountSheetProps) {
  const [tokens, setTokens] = useState<Record<string, any>>({});
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [configured, setConfigured] = useState<Record<Provider, boolean>>({
    github: false,
    gitlab: false,
  });
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    async function checkConfig() {
      setLoadingConfig(true);
      try {
        const githubConfigured = await isOAuthConfigured('github');
        const gitlabConfigured = await isOAuthConfigured('gitlab');
        setConfigured({ github: githubConfigured, gitlab: gitlabConfigured });
      } catch (error) {
        console.error('Failed to check OAuth configuration:', error);
      } finally {
        setLoadingConfig(false);
      }
    }
    checkConfig();
  }, []);

  useEffect(() => {
    setTokens(getAllTokens());
  }, []);

  const handleConnect = async (provider: Provider) => {
    try {
      setConnecting(provider);
      await startOAuthFlow(provider);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : 'Failed to start OAuth flow'
      );
      setConnecting(null);
    }
  };

  const handleDisconnect = (provider: Provider) => {
    if (
      confirm(
        `Disconnect from ${provider}? You'll need to reconnect to access your repositories.`
      )
    ) {
      removeToken(provider);
      setTokens(getAllTokens());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background relative w-full max-w-2xl rounded-lg shadow-lg">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Account Connections</h2>
              <p className="text-muted-foreground text-sm">
                Connect your Git providers to browse repositories
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
          {!hasAnyTokens() && !loadingConfig && (
            <Alert>
              <AlertDescription>
                Connect at least one provider to browse your repositories
                directly from the app.
              </AlertDescription>
            </Alert>
          )}

          {loadingConfig ? (
            <div className="text-muted-foreground flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              <span className="ml-3">Loading configuration...</span>
            </div>
          ) : (
            PROVIDERS.map((provider) => {
              const isConnected = !!tokens[provider.id];
              const tokenData = tokens[provider.id] as TokenData;
              const isConfigured = configured[provider.id];

              return (
                <Card key={provider.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <provider.icon
                          className={`h-8 w-8 ${provider.color}`}
                        />
                        <div>
                          <CardTitle>{provider.name}</CardTitle>
                          {isConnected && tokenData && (
                            <CardDescription className="mt-1">
                              Connected as{' '}
                              <span className="font-medium">
                                @{tokenData.user.username}
                              </span>
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <>
                            <Check className="h-5 w-5 text-green-600" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDisconnect(provider.id)}
                            >
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => handleConnect(provider.id)}
                            disabled={
                              !isConfigured || connecting === provider.id
                            }
                            size="sm"
                          >
                            {connecting === provider.id
                              ? 'Connecting...'
                              : 'Connect'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {isConnected && tokenData && (
                    <CardContent>
                      <div className="flex items-center gap-3">
                        {tokenData.user.avatar && (
                          <img
                            src={tokenData.user.avatar}
                            alt={tokenData.user.name}
                            className="h-10 w-10 rounded-full"
                          />
                        )}
                        <div className="text-sm">
                          <div className="font-medium">
                            {tokenData.user.name}
                          </div>
                          <div className="text-muted-foreground">
                            Connected{' '}
                            {new Date(
                              tokenData.connectedAt
                            ).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}

                  {!isConfigured && (
                    <CardContent>
                      <Alert>
                        <AlertDescription className="text-xs">
                          OAuth not configured. Please contact the administrator
                          to set up {provider.name} authentication.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>

        <div className="border-t p-6">
          <p className="text-muted-foreground text-center text-xs">
            🔒 Tokens are stored locally and never sent to any server
          </p>
        </div>
      </div>
    </div>
  );
}
