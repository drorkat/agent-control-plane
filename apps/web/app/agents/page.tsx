'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  Cpu,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import {
  Agent,
  PROVIDER_OPTIONS,
  providerLabel,
  statusLabel,
  statusVariant,
} from './types';

// Shared control styling (mirrors the Input component) minus a fixed height, so
// the <select> can match Input's h-9 while the <textarea> grows.
const fieldControl =
  'flex w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const labelClass = 'block text-sm font-medium text-foreground';

type FormState = {
  name: string;
  provider: string;
  model: string;
  role: string;
  instructions: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  provider: 'anthropic',
  model: '',
  role: '',
  instructions: '',
};

export default function AgentsPage() {
  const { t } = useI18n();
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Agent[]>('/agents');
      setAgents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agents.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post<Agent>('/agents', {
        name: form.name.trim(),
        provider: form.provider,
        model: form.model.trim(),
        role: form.role.trim() || undefined,
        instructions: form.instructions.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('agents.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('agents.title')}
              </h1>
              {!loading && !error && (
                <Badge variant="neutral">{agents.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('agents.subtitle')}</p>
          </div>
          {showForm ? (
            <Button variant="secondary" size="md" onClick={closeForm}>
              <X />
              {t('common.cancel')}
            </Button>
          ) : (
            <Button size="md" onClick={openForm}>
              <Plus />
              {t('agents.new')}
            </Button>
          )}
        </div>

        {/* Inline create form */}
        {showForm && (
          <Card className="animate-fade-up">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="agent-name" className={labelClass}>
                      {t('common.name')} <span className="text-danger">*</span>
                    </label>
                    <Input
                      id="agent-name"
                      required
                      autoFocus
                      placeholder={t('agents.form.namePlaceholder')}
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="agent-role" className={labelClass}>
                      {t('agents.form.role')}
                    </label>
                    <Input
                      id="agent-role"
                      placeholder={t('agents.form.rolePlaceholder')}
                      value={form.role}
                      onChange={(e) => updateField('role', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="agent-provider" className={labelClass}>
                      {t('common.provider')} <span className="text-danger">*</span>
                    </label>
                    <select
                      id="agent-provider"
                      required
                      className={cn(fieldControl, 'h-9 py-1')}
                      value={form.provider}
                      onChange={(e) => updateField('provider', e.target.value)}
                    >
                      {PROVIDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="agent-model" className={labelClass}>
                      {t('agents.form.model')} <span className="text-danger">*</span>
                    </label>
                    <Input
                      id="agent-model"
                      required
                      placeholder={t('agents.form.modelPlaceholder')}
                      value={form.model}
                      onChange={(e) => updateField('model', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="agent-instructions" className={labelClass}>
                    {t('agents.form.instructions')}
                  </label>
                  <textarea
                    id="agent-instructions"
                    rows={4}
                    placeholder={t('agents.form.instructionsPlaceholder')}
                    className={cn(fieldControl, 'min-h-[96px] resize-y py-2 leading-relaxed')}
                    value={form.instructions}
                    onChange={(e) => updateField('instructions', e.target.value)}
                  />
                </div>

                {formError && (
                  <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" size="md" onClick={closeForm} disabled={submitting}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" size="md" disabled={submitting}>
                    {submitting ? t('common.creating') : t('agents.create')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Content states */}
        {loading ? (
          <AgentGridSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} t={t} />
        ) : agents.length === 0 ? (
          <EmptyState onCreate={openForm} t={t} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} t={t} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AgentCard({ agent, t }: { agent: Agent; t: TranslateFn }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full transition-shadow duration-200 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{agent.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {agent.role || t('agents.noRole')}
                </p>
              </div>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground rtl:-scale-x-100" />
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <Badge variant="primary">{providerLabel(agent.provider)}</Badge>
            <Badge variant={statusVariant(agent.status)} dot>
              {statusLabel(agent.status, t)}
            </Badge>
            <span className="ms-auto inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Cpu className="size-3" />
              {agent.model}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AgentGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="w-full space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ onCreate, t }: { onCreate: () => void; t: TranslateFn }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <Bot className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('agents.emptyTitle')}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{t('agents.emptyDesc')}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onCreate}>
        <Plus />
        {t('agents.new')}
      </Button>
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
        <p className="text-sm font-semibold text-foreground">{t('agents.loadErrorTitle')}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}
