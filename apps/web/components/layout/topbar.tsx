'use client';

import { Bell, ChevronDown, Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

const iconButton =
  'inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground ' +
  'transition-colors hover:bg-accent hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* Mobile: menu + compact brand */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
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
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search agents, tasks, runs…"
          aria-label="Search"
          className={cn(
            'h-9 w-full rounded-lg border border-input bg-card pl-9 pr-14 text-sm text-foreground shadow-xs',
            'transition-colors placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
          )}
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground xl:inline-flex">
          ⌘K
        </kbd>
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />

        <button type="button" aria-label="Notifications" className={cn(iconButton, 'relative')}>
          <Bell className="size-[18px]" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-background" />
        </button>

        {/* Placeholder user menu */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:pr-2"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-violet-500 text-xs font-semibold text-white ring-1 ring-inset ring-white/15">
            AR
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-foreground">Alex Rivera</span>
            <span className="block text-[11px] text-muted-foreground">Admin</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
        </button>
      </div>
    </header>
  );
}
