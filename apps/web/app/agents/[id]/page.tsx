'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Cpu,
  Gauge,
  RotateCcw,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import { Agent, providerLabel, statusLabel, statusVariant } from '../types';

export default function AgentDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [agent, setAgent] = React.useState<Agent | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Agent>(`/agents/${id}`);
      setAgent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agents.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/agents/${id}`);
      router.push('/agents');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('agents.detail.deleteError'));
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {t('agents.detail.back')}
        </Link>

        {loading ? (
          <DetailSkeleton />
        ) : error || !agent ? (
          <ErrorState message={error ?? t('agents.detail.notFound')} onRetry={load} t={t} />
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bot className="size-6" />
                </span>
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {agent.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(agent.status)} dot>
                      {statusLabel(agent.status, t)}
                    </Badge>
                    <Badge variant="primary">{providerLabel(agent.provider)}</Badge>
                    {agent.role && (
                      <span className="text-sm text-muted-foreground">{agent.role}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {confirmingDelete ? (
                  <>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button variant="danger" size="md" onClick={handleDelete} disabled={deleting}>
                      <Trash2 />
                      {deleting ? t('common.deleting') : t('common.confirmDelete')}
                    </Button>
                  </>
                ) : (
                  <Button variant="danger" size="md" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 />
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </div>

            {deleteError && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Detail panels */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>{t('agents.detail.configuration')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DetailRow
                    icon={Sparkles}
                    label={t('common.provider')}
                    value={providerLabel(agent.provider)}
                  />
                  <DetailRow icon={Cpu} label={t('agents.form.model')} value={agent.model} mono />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Gauge className="size-4 shrink-0" />
                      <span>{t('agents.detail.autonomy')}</span>
                      <span className="ms-auto font-medium text-foreground">
                        {t('agents.detail.autonomyLevel', { level: agent.autonomyLevel })}
                      </span>
                    </div>
                    <AutonomyMeter level={agent.autonomyLevel} />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t('agents.form.instructions')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {agent.instructions ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {agent.instructions}
                    </p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      {t('agents.detail.noInstructions')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('ms-auto font-medium text-foreground', mono && 'font-mono text-[13px]')}>
        {value}
      </span>
    </div>
  );
}

/** Four segments (levels 1–4); level 0 leaves all empty, level 4 fills all. */
function AutonomyMeter({ level }: { level: number }) {
  const clamped = Math.max(0, Math.min(4, level));
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            i < clamped ? 'bg-primary' : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="size-12 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-4 p-6">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-6">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  t,
}: {
  message: string;
  onRetry: () => void;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-danger/30 bg-danger/5 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-danger shadow-xs ring-1 ring-danger/25">
        <AlertCircle className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('agents.detail.loadErrorTitle')}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}
