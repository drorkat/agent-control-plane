'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  ScrollText,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { usePendingApprovals } from '@/lib/approvals/context';
import { useI18n } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

type NavItem = {
  labelKey: TranslationKey;
  href: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { labelKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
  { labelKey: 'nav.projects', href: '/projects', icon: FolderKanban },
  { labelKey: 'nav.agents', href: '/agents', icon: Bot },
  { labelKey: 'nav.tasks', href: '/tasks', icon: ListTodo },
  { labelKey: 'nav.runs', href: '/runs', icon: Activity },
  { labelKey: 'nav.approvals', href: '/approvals', icon: ShieldCheck },
  { labelKey: 'nav.audit', href: '/audit', icon: ScrollText },
  { labelKey: 'nav.settings', href: '/settings', icon: Settings },
];

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { count: pendingApprovals } = usePendingApprovals();

  return (
    <aside className={cn('flex h-full w-64 flex-col border-e border-border bg-card', className)}>
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <Logo className="size-9" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold leading-tight text-foreground">
            Agent Control
          </span>
          <span className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
            Control Plane
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t('nav.workspace')}
        </p>
        {NAV.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          // Live badge: the pending-approvals count on the Approvals item only.
          const badge =
            item.href === '/approvals' && pendingApprovals > 0
              ? pendingApprovals > 99
                ? '99+'
                : String(pendingApprovals)
              : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
                active
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {active && (
                <span
                  className="absolute inset-y-1.5 start-0 w-0.5 rounded-e-full bg-primary"
                  aria-hidden
                />
              )}
              <Icon
                className={cn(
                  'size-[18px] shrink-0 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
              {badge && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary ring-1 ring-inset ring-primary/20">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {t('nav.operational')}
        </div>
      </div>
    </aside>
  );
}
