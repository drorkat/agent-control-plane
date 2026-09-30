'use client';

import * as React from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/context';

interface PendingApprovalsContextValue {
  /** Number of approvals awaiting a decision in the current org (0 signed out). */
  count: number;
  /** Re-fetch the pending count now (call right after approving/rejecting). */
  refresh: () => Promise<void>;
}

const PendingApprovalsContext =
  React.createContext<PendingApprovalsContextValue | null>(null);

/** How often to re-poll the pending count while signed in (ms). */
const POLL_MS = 30_000;

/**
 * Tracks the live count of pending approvals and shares it with the sidebar
 * badge. It fetches only while signed in (guarded by {@link useAuth}), polls on
 * an interval, and refreshes when the tab regains focus, so the badge stays
 * current without a page reload. A fetch error is swallowed and leaves the last
 * known count in place. Mounted above the app shell (in the root layout) so a
 * single instance is shared across every route.
 */
export function PendingApprovalsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [count, setCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    try {
      const pending = await api.get<unknown[]>('/approvals?status=pending');
      setCount(Array.isArray(pending) ? pending.length : 0);
    } catch {
      // Transient error or a 401 while signing out — keep the last known count.
    }
  }, [user]);

  React.useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  const value = React.useMemo<PendingApprovalsContextValue>(
    () => ({ count, refresh }),
    [count, refresh],
  );

  return (
    <PendingApprovalsContext.Provider value={value}>
      {children}
    </PendingApprovalsContext.Provider>
  );
}

/** Access the live pending-approvals count and a manual refresh. */
export function usePendingApprovals(): PendingApprovalsContextValue {
  const ctx = React.useContext(PendingApprovalsContext);
  if (!ctx) {
    throw new Error(
      'usePendingApprovals must be used within a <PendingApprovalsProvider>',
    );
  }
  return ctx;
}
