'use client';

import * as React from 'react';
import { Bell, ChevronDown, LogOut, Menu, Search } from 'lucide-react';
import { useAuth, type AuthUser } from '@/lib/auth/context';
import { useI18n, type Lang } from '@/lib/i18n/context';
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

        <button type="button" aria-label={t('topbar.notifications')} className={cn(iconButton, 'relative')}>
          <Bell className="size-[18px]" />
          <span className="absolute end-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-background" />
        </button>

        {/* Real user menu (only when signed in) */}
        {user && <UserMenu user={user} />}
      </div>
    </header>
  );
}
