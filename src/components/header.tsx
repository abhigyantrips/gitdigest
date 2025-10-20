import { User } from 'lucide-react';

import { useState } from 'react';

import { hasAnyTokens } from '@/lib/storage';

import { AccountSheet } from '@/components/account-sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export function Header() {
  const [showAccount, setShowAccount] = useState(false);
  const hasConnections = hasAnyTokens();

  return (
    <>
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between gap-4 p-4">
          <div>
            <a href="/" className="text-xl font-bold">
              GitDigest
            </a>
            <p className="text-muted-foreground text-sm">
              Generate AI-ready digests from any Git repository.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowAccount(true)}>
              <User className="h-4 w-4" />
              {hasConnections ? 'Accounts' : 'Connect'}
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/abhigyantrips/gitdigest"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {showAccount && <AccountSheet onClose={() => setShowAccount(false)} />}
    </>
  );
}
