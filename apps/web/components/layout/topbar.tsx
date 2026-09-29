'use client';

import { Bell, ChevronDown, Menu, Search } from 'lucide-react';
import { useI18n, type Lang } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

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

        {/* Placeholder user menu */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg p-1 pe-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:pe-2"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-violet-500 text-xs font-semibold text-white ring-1 ring-inset ring-white/15">
            AR
          </span>
          <span className="hidden text-start leading-tight sm:block">
            <span className="block text-sm font-medium text-foreground">Alex Rivera</span>
            <span className="block text-[11px] text-muted-foreground">{t('topbar.admin')}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
        </button>
      </div>
    </header>
  );
}
