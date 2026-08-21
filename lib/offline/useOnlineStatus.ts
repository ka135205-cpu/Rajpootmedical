'use client';

import { useEffect, useState } from 'react';
import { startOfflineSyncListener, syncPendingSales } from './sync';

/**
 * Tracks connectivity and drives automatic queue sync. Mount once near the
 * root of the authenticated app shell:
 *
 *   const { isOnline } = useOnlineStatus();
 *   {!isOnline && <OfflineBanner />}
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    const stopSync = startOfflineSyncListener();
    if (navigator.onLine) void syncPendingSales();

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      stopSync();
    };
  }, []);

  return { isOnline };
}
