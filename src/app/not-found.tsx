'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Get the full path after the domain
      const fullPath = window.location.pathname.slice(1); // Remove leading /

      if (fullPath) {
        // Fix the double slash issue in protocols
        // /https:/github.com -> https://github.com
        const repoUrl = fullPath.replace(/^(https?):\/([^/])/, '$1://$2');

        router.replace(`/?url=${encodeURIComponent(repoUrl)}`);
      } else {
        // No path, go to home
        router.replace('/');
      }
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="border-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2"></div>
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}
