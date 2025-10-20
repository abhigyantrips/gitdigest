let cachedConfig: {
  github: { clientId: string };
  gitlab: { clientId: string };
} | null = null;

const CONFIG_URL = 'https://cors.abhigyantrips.workers.dev/config';

export async function getOAuthConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const response = await fetch(CONFIG_URL);
    if (!response.ok) {
      throw new Error('Failed to fetch OAuth config');
    }
    cachedConfig = await response.json();
    return cachedConfig;
  } catch (error) {
    console.error('Failed to fetch OAuth config:', error);
    throw new Error(
      'Could not load OAuth configuration. Please try again later.'
    );
  }
}
