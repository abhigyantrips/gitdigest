export interface ParsedRepo {
  host: string;
  owner: string;
  repo: string;
  branch?: string;
  commit?: string;
  subpath?: string;
}

export function parseGitUrl(input: string): ParsedRepo {
  // Remove trailing .git
  input = input.replace(/\.git$/, '');
  
  // Handle different URL formats
  let url: URL;
  
  if (input.startsWith('http://') || input.startsWith('https://')) {
    url = new URL(input);
  } else if (input.includes('github.com') || input.includes('gitlab.com')) {
    url = new URL(`https://${input}`);
  } else {
    // Assume github.com for user/repo format
    url = new URL(`https://github.com/${input}`);
  }
  
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  if (pathParts.length < 2) {
    throw new Error('Invalid repository URL');
  }
  
  const [owner, repo, ...rest] = pathParts;
  
  const parsed: ParsedRepo = {
    host: url.hostname,
    owner,
    repo,
  };
  
  // Parse branch/commit/subpath
  if (rest.length > 0) {
    const type = rest[0]; // 'tree', 'blob', etc.
    
    if (type === 'tree' || type === 'blob') {
      parsed.branch = rest[1];
      
      if (rest.length > 2) {
        parsed.subpath = rest.slice(2).join('/');
      }
    }
  }
  
  return parsed;
}