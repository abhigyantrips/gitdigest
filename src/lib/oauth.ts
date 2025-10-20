import { getOAuthConfig } from '@/lib/config';

const OAUTH_CONFIGS = {
  github: {
    authEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    apiBase: 'https://api.github.com',
    scopes: ['repo', 'read:user'],
  },
  gitlab: {
    authEndpoint: 'https://gitlab.com/oauth/authorize',
    tokenEndpoint: 'https://gitlab.com/oauth/token',
    apiBase: 'https://gitlab.com/api/v4',
    scopes: ['read_api', 'read_repository'],
  },
} as const;

const OAUTH_PROXY = 'https://cors.abhigyantrips.workers.dev/oauth';
const API_PROXY = 'https://cors.abhigyantrips.workers.dev/apis';

export type Provider = keyof typeof OAUTH_CONFIGS;

// PKCE helpers
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

function base64URLEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function startOAuthFlow(provider: Provider) {
  const config = OAUTH_CONFIGS[provider];

  // Fetch client ID from worker
  const oauthConfig = await getOAuthConfig();
  const clientId = oauthConfig?.[provider].clientId;

  if (!clientId) {
    throw new Error(
      `${provider} OAuth not configured. Please contact the administrator.`
    );
  }

  const codeVerifier = generateCodeVerifier();
  const state = generateCodeVerifier();

  sessionStorage.setItem('oauth_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);
  sessionStorage.setItem('oauth_provider', provider);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}`,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  window.location.href = `${config.authEndpoint}?${params}`;
}

export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<{ accessToken: string; provider: Provider }> {
  const storedState = sessionStorage.getItem('oauth_state');
  const provider = sessionStorage.getItem('oauth_provider') as Provider;

  if (state !== storedState || !provider) {
    throw new Error('Invalid OAuth state');
  }

  const config = OAUTH_CONFIGS[provider];
  const proxyUrl = `${OAUTH_PROXY}?url=${encodeURIComponent(config.tokenEndpoint)}`;

  console.log('🔄 OAuth token exchange:', {
    provider,
    proxyUrl,
    hasCode: !!code,
  });

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      code,
      redirect_uri: `${window.location.origin}`,
      grant_type: 'authorization_code',
    }),
  });

  console.log('📥 Token response status:', response.status);

  const data = await response.json();
  console.log('📥 Token response data:', data);

  if (!response.ok || data.error) {
    console.error('❌ OAuth token exchange failed:', data);
    throw new Error(
      `OAuth token exchange failed: ${data.error_description || data.error || data.message || JSON.stringify(data)}`
    );
  }

  if (!data.access_token) {
    console.error('❌ No access_token in response:', data);
    throw new Error(
      `No access token received. Response: ${JSON.stringify(data)}`
    );
  }

  console.log('✅ Token received:', {
    provider,
    tokenLength: data.access_token.length,
    tokenType: data.token_type,
    scope: data.scope,
  });

  // Clean up
  sessionStorage.removeItem('oauth_verifier');
  sessionStorage.removeItem('oauth_state');
  sessionStorage.removeItem('oauth_provider');

  return {
    accessToken: data.access_token,
    provider,
  };
}

export async function fetchUser(provider: Provider, token: string) {
  const config = OAUTH_CONFIGS[provider];

  const endpoints = {
    github: `${config.apiBase}/user`,
    gitlab: `${config.apiBase}/user`,
    bitbucket: `${config.apiBase}/user`,
  };

  const targetUrl = endpoints[provider];
  const proxyUrl = `${API_PROXY}?url=${encodeURIComponent(targetUrl)}`;

  const response = await fetch(proxyUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch user: ${errorText}`);
  }

  const data = await response.json();

  return {
    id: data.id || data.uuid,
    username: data.login || data.username || data.display_name,
    name: data.name || data.display_name,
    avatar: data.avatar_url || data.avatar || data.links?.avatar?.href,
  };
}

export async function fetchRepositories(provider: Provider, token: string) {
  const config = OAUTH_CONFIGS[provider];

  const endpoints = {
    github: `${config.apiBase}/user/repos?per_page=100&sort=updated`,
    gitlab: `${config.apiBase}/projects?membership=true&per_page=100&order_by=updated_at`,
    bitbucket: `${config.apiBase}/repositories?role=member&sort=-updated_on`,
  };

  const targetUrl = endpoints[provider];
  const proxyUrl = `${API_PROXY}?url=${encodeURIComponent(targetUrl)}`;

  const response = await fetch(proxyUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch repositories: ${errorText}`);
  }

  const data = await response.json();

  return data.map((repo: any) => ({
    id: String(repo.id || repo.uuid),
    name: repo.name,
    fullName:
      provider === 'github'
        ? repo.full_name
        : provider === 'gitlab'
          ? repo.path_with_namespace
          : repo.full_name,
    url: repo.html_url || repo.web_url || repo.links?.html?.href,
    cloneUrl:
      repo.clone_url || repo.http_url_to_repo || repo.links?.clone?.[0]?.href,
    isPrivate: repo.private || repo.visibility === 'private',
    defaultBranch: repo.default_branch || repo.mainbranch?.name || 'main',
    updatedAt: repo.updated_at || repo.last_activity_at || repo.updated_on,
  }));
}

export async function isOAuthConfigured(provider: Provider): Promise<boolean> {
  try {
    const config = await getOAuthConfig();
    return !!config?.[provider]?.clientId;
  } catch {
    return false;
  }
}
