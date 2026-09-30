'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { useI18n } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/** Full-viewport centered spinner, shown while auth resolves or redirects. */
function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

/**
 * The application frame: a fixed sidebar on desktop, a slide-in drawer on
 * mobile, a sticky topbar, and a scrolling content area.
 *
 * Also the client-side auth gate: while the session is being checked it shows
 * a spinner, and signed-out visitors are redirected to `/login` (the login
 * and signup pages are standalone and do not use this shell, so they are not
 * gated).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);

  // Redirect to the login page once we know the visitor is signed out.
  React.useEffect(() => {
    if (!loading && user === null) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  // Close the drawer on Escape, and lock body scroll while it is open.
  React.useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  // While the session is resolving, or while we redirect a signed-out
  // visitor, render only a spinner (never the app chrome or its data).
  if (loading || user === null) {
    return <AuthLoading />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <Sidebar className="sticky top-0 hidden h-screen lg:flex" />

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          drawerOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={closeDrawer}
          className={cn(
            'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/60',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.navigation')}
          className={cn(
            'absolute inset-y-0 start-0 shadow-lg transition-transform duration-300 ease-out',
            // Anchored to the inline-start edge; when closed it slides off that
            // edge — to the left in LTR, to the right in RTL.
            drawerOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
          )}
        >
          <Sidebar className="h-full" onNavigate={closeDrawer} />
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="relative flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/[0.05] to-transparent"
          />
          <div className="relative mx-auto w-full max-w-7xl animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
