'use client';

import * as React from 'react';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Inbox,
  Loader2,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  TriangleAlert,
} from 'lucide-react';
// Reuse the app's existing locale-aware relative-time formatter.
import { formatRelativeTime } from '@/app/approvals/types';
import { useAuth, type AuthUser } from '@/lib/auth/context';
import { useI18n, type Lang } from '@/lib/i18n/context';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

/** Up-to-two-letter initials from a display name, falling back to the email. */
function initialsOf(name: string | null, email: string): string {
  const source = (name && name.trim()) || email;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Humanize a raw role enum (e.g. "ADMIN" → "Admin", "owner" → "Owner"). */
function humanizeRole(role: string): string {
  if (!role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/** The signed-in user's avatar, name/role, and a logout dropdown. */
function UserMenu({ user }: { user: AuthUser }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayName = (user.name && user.name.trim()) || user.email;
  const initials = initialsOf(user.name, user.email);
  const role = humanizeRole(user.role);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg p-1 pe-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:pe-2"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-violet-500 text-xs font-semibold text-white ring-1 ring-inset ring-white/15">
          {initials}
        </span>
        <span className="hidden max-w-[10rem] text-start leading-tight sm:block">
          <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
          {role && <span className="block truncate text-[11px] text-muted-foreground">{role}</span>}
        </span>
        <ChevronDown
          className={cn(
            'hidden size-4 text-muted-foreground transition-transform sm:block',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={displayName}
          className="absolute end-0 top-full z-40 mt-2 w-60 origin-top overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-fade-in"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">
              {user.email}
            </p>
          </div>
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
            >
              <LogOut className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
              {t('auth.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconButton =
  'inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground ' +
  'transition-colors hover:bg-accent hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** EN / עברית segmented control that flips the whole app's language + direction. */
function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  const options: { value: Lang; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'he', label: 'עברית' },
  ];
  return (
    <div
      role="group"
      aria-label={t('topbar.toggleLanguage')}
      className="inline-flex h-9 items-center rounded-lg border border-border bg-card p-0.5 text-xs font-medium"
    >
      {options.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLang(option.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex h-full items-center rounded-md px-2.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The notifications bell: an unread-count badge, and a popover panel listing
 * recent notifications with a "mark all read" action. Closes on outside-click
 * and Escape; the panel is anchored to the inline-end edge (RTL-correct).
 */
function NotificationsMenu() {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Best-effort unread count; keep the last known value on failure.
  const refreshCount = React.useCallback(async () => {
    try {
      setCount(await getUnreadCount());
    } catch {
      /* leave the last known count in place */
    }
  }, []);

  const loadList = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listNotifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Poll the unread count on mount and every 30s (cleaned up on unmount).
  React.useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), 30_000);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  // While open: (re)load the list, refresh the count, and wire up dismissal.
  React.useEffect(() => {
    if (!open) return;
    void loadList();
    void refreshCount();
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, loadList, refreshCount]);

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await Promise.all([loadList(), refreshCount()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.loadError'));
    } finally {
      setMarkingAll(false);
    }
  }

  function handleItemClick(n: AppNotification) {
    if (n.read) return;
    // Optimistically mark read locally; the server call is best-effort.
    setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)));
    setCount((c) => Math.max(0, c - 1));
    void markNotificationRead(n.id).catch(() => {
      /* best-effort — a failed read stays reflected only until the next reload */
    });
  }

  const hasUnread = count > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notifications.aria')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(iconButton, 'relative')}
      >
        <Bell className="size-[18px]" />
        {hasUnread && (
          <span className="absolute -end-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          className="absolute end-0 top-full z-40 mt-2 w-80 origin-top overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-fade-in sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{t('notifications.title')}</p>
              {hasUnread && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t('notifications.unread', { count })}
                </span>
              )}
            </div>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={markingAll}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="size-3.5" />
                )}
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <NotificationsSkeleton />
            ) : error ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-danger/10 text-danger">
                  <TriangleAlert className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadList()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw className="size-3.5" />
                  {t('common.tryAgain')}
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                        !n.read && 'bg-primary/[0.04]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          n.read ? 'bg-transparent' : 'bg-primary',
                        )}
                      />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            n.read ? 'font-medium text-foreground/80' : 'font-semibold text-foreground',
                          )}
                        >
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="block line-clamp-2 text-xs text-muted-foreground" dir="auto">
                            {n.body}
                          </span>
                        )}
                        <span className="block text-[11px] text-muted-foreground">
                          {formatRelativeTime(n.createdAt, lang)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
          <div className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 max-w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* Mobile: menu + compact brand */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t('topbar.openMenu')}
        className={cn(iconButton, 'lg:hidden')}
      >
        <Menu className="size-[18px]" />
      </button>
      <div className="flex items-center gap-2 lg:hidden">
        <Logo className="size-8" />
        <span className="truncate text-sm font-semibold text-foreground">Agent Control Plane</span>
      </div>

      {/* Desktop: search */}
      <div className="relative hidden w-full max-w-md lg:block">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder={t('topbar.searchPlaceholder')}
          aria-label={t('topbar.search')}
          className={cn(
            'h-9 w-full rounded-lg border border-input bg-card ps-9 pe-14 text-sm text-foreground shadow-xs',
            'transition-colors placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
          )}
        />
        <kbd className="pointer-events-none absolute end-2.5 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground xl:inline-flex">
          ⌘K
        </kbd>
      </div>

      {/* Right cluster */}
      <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
        <LanguageToggle />
        <ThemeToggle />

        <NotificationsMenu />

        {/* Real user menu (only when signed in) */}
        {user && <UserMenu user={user} />}
      </div>
    </header>
  );
}
