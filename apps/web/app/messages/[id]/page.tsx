'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Redirect old /messages/[id] links to /messages
// The new layout shows chat inline on the same page
export default function MessageThreadRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    router.replace('/messages');
  }, [router]);
  return null;
}
