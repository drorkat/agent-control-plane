'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toggles the `.dark` class on <html> and persists the choice. The correct
 * theme is applied pre-paint by the inline script in the root layout, so the
 * icon shown here is driven purely by the class (no hydration mismatch).
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');
    root.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      title="Toggle theme"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground',
        'transition-colors hover:bg-accent hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Sun className="size-[18px] dark:hidden" />
      <Moon className="hidden size-[18px] dark:block" />
    </button>
  );
}
