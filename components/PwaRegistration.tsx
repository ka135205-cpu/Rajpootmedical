'use client';

import { useEffect } from 'react';
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus';

export function PwaRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal — app still works online, just without app-shell caching.
      });
    }
  }, []);

  return null;
}

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="w-full bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white print:hidden">
      You&apos;re offline. Sales can still be completed and will sync automatically once
      connectivity returns.
    </div>
  );
}
