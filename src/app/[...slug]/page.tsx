'use client';

import { useEffect } from 'react';

import { useParams, useRouter } from 'next/navigation';

import Home from '@/app/page';

export default function DynamicUrlPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    // Extract the repository URL from the slug
    const slug = params.slug as string[];
    if (slug && slug.length > 0) {
      // Reconstruct the URL
      const repoUrl = slug.join('/');

      // Redirect to home with the URL as a query parameter
      router.push(`/?url=${encodeURIComponent(repoUrl)}`);
    }
  }, [params, router]);

  return <Home />;
}
