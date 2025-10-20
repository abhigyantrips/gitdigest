import type { Provider } from '@/lib/oauth';

export interface TokenData {
  token: string;
  provider: Provider;
  user: {
    id: string;
    username: string;
    name: string;
    avatar: string;
  };
  connectedAt: string;
}

const STORAGE_KEY = 'gitdigest_tokens';

export function saveToken(provider: Provider, data: TokenData) {
  const tokens = getAllTokens();
  tokens[provider] = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function getToken(provider: Provider): TokenData | null {
  const tokens = getAllTokens();
  return tokens[provider] || null;
}

export function getAllTokens(): Record<string, TokenData> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function removeToken(provider: Provider) {
  const tokens = getAllTokens();
  delete tokens[provider];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function hasAnyTokens(): boolean {
  return Object.keys(getAllTokens()).length > 0;
}
