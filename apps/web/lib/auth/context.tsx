'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/** The authenticated user as returned by the auth endpoints. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organizationId: string;
}

interface AuthContextValue {
  /** The current user, or `null` when signed out. */
  user: AuthUser | null;
  /** True while the initial `GET /auth/me` check is in flight. */
  loading: boolean;
  /** Re-fetch `GET /auth/me` and update `user` (call after login/signup). */
  refresh: () => Promise<void>;
  /** Sign out on the server, clear local state, and redirect to `/login`. */
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * App-wide authentication state. On mount it asks `GET /api/auth/me`: a 200
 * (or any success) populates `user`; a 401 (or any failure) leaves `user`
 * null. The httpOnly session cookie is sent automatically with same-origin
 * `/api/*` requests, so there is no token to store here.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me);
    } catch {
      // 401 (not signed in) or a transient error — treat as signed out.
      setUser(null);
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the request fails, drop local auth state below.
    }
    setUser(null);
    router.replace('/login');
  }, [router]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the current user, loading state, and `refresh`/`logout` actions. */
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
