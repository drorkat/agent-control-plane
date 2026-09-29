'use client';

import * as React from 'react';
import {
  AlertCircle,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// Safe, client-facing shape of a stored provider credential. The API never
// returns key material (ciphertext/iv/authTag) or the plaintext key itself.
type ProviderCredential = {
  id: string;
  provider: string;
  label: string | null;
  last4: string | null;
  createdAt: string;
};

const PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

/** Human-friendly provider name, falling back to a capitalized value. */
function providerLabel(provider: string): string {
  const key = provider.toLowerCase();
  return PROVIDER_LABELS[key] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

// Mirrors the design-system <Input>, minus a fixed height, so the <select>
// matches the h-9 control styling without introducing any global styles.
const fieldControl =
  'flex w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const labelClass = 'block text-sm font-medium text-foreground';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Masked display for a stored key: fixed dots plus the retained last 4 chars. */
function maskedKey(last4: string | null): string {
  return `••••••••${last4 ?? '••••'}`;
}

export default function SettingsPage() {
  const [credentials, setCredentials] = React.useState<ProviderCredential[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [showForm, setShowForm] = React.useState(false);
  const [provider, setProvider] = React.useState('anthropic');
  const [label, setLabel] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ProviderCredential[]>('/providers');
      setCredentials(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider keys');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setProvider('anthropic');
    setLabel('');
    setApiKey('');
    setFormError(null);
  }

  function openForm() {
    resetForm();
    setShowForm(true);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < 8) {
      setFormError('Enter a valid API key (at least 8 characters).');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.post<ProviderCredential>('/providers', {
        provider,
        label: label.trim() || undefined,
        apiKey: trimmedKey,
      });
      // The API returns rows newest-first, so prepend to keep them in sync.
      setCredentials((prev) => [created, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save provider key');
    } finally {
      setSubmitting(false);
    }
  }

  const hasCredentials = credentials.length > 0;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Page header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage workspace configuration and integrations.
          </p>
        </div>

        {/* AI Providers section */}
        <section className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  AI Providers
                </h2>
                {!loading && !error && hasCredentials && (
                  <Badge variant="neutral">{credentials.length}</Badge>
                )}
              </div>
              <p className="max-w-prose text-sm text-muted-foreground">
                Bring your own API keys so your agents can call the models. Keys are encrypted at
                rest and never shown again after saving.
              </p>
            </div>
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              size="md"
              onClick={() => (showForm ? closeForm() : openForm())}
            >
              {showForm ? (
                <>
                  <X />
                  Cancel
                </>
              ) : (
                <>
                  <Plus />
                  Add provider key
                </>
              )}
            </Button>
          </div>

          {/* Inline add form */}
          {showForm && (
            <Card className="animate-fade-up">
              <CardContent className="p-5">
                <form onSubmit={handleCreate} className="space-y-4" noValidate>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="provider-select" className={labelClass}>
                        Provider <span className="text-danger">*</span>
                      </label>
                      <select
                        id="provider-select"
                        className={cn(fieldControl, 'h-9 py-1')}
                        value={provider}
                        onChange={(event) => setProvider(event.target.value)}
                        disabled={submitting}
                      >
                        {PROVIDER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="provider-label" className={labelClass}>
                        Label
                      </label>
                      <Input
                        id="provider-label"
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        placeholder="e.g. Production key"
                        maxLength={200}
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="provider-api-key" className={labelClass}>
                      API key <span className="text-danger">*</span>
                    </label>
                    <Input
                      id="provider-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="sk-…"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={submitting}
                    />
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="size-3.5 shrink-0" />
                      Stored encrypted. You won&apos;t be able to view the key again after saving.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse items-stretch gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
                    {formError && (
                      <p className="flex items-center gap-1.5 text-sm text-danger sm:mr-auto">
                        <TriangleAlert className="size-4 shrink-0" />
                        {formError}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={closeForm}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="md"
                      disabled={submitting || apiKey.trim().length < 8}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Plus />
                          Save key
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Content states */}
          {loading ? (
            <CredentialListSkeleton />
          ) : error ? (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
                    <TriangleAlert className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Couldn&apos;t load provider keys
                    </p>
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">{error}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    <RotateCcw />
                    Try again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : hasCredentials ? (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {credentials.map((credential) => (
                  <CredentialRow
                    key={credential.id}
                    credential={credential}
                    onDeleted={(id) =>
                      setCredentials((prev) => prev.filter((c) => c.id !== id))
                    }
                  />
                ))}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
                <KeyRound className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No provider keys yet</p>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  Add an Anthropic or OpenAI API key so your agents can call the models. Keys are
                  encrypted at rest.
                </p>
              </div>
              {!showForm && (
                <Button variant="secondary" size="sm" onClick={openForm}>
                  <Plus />
                  Add provider key
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function CredentialRow({
  credential,
  onDeleted,
}: {
  credential: ProviderCredential;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/providers/${credential.id}`);
      onDeleted(credential.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key');
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{providerLabel(credential.provider)}</Badge>
            {credential.label && (
              <span className="truncate text-sm font-medium text-foreground">
                {credential.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono tracking-wider text-foreground/80">
              {maskedKey(credential.last4)}
            </span>
            <span>Added {formatDate(credential.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {error && (
          <span className="flex items-center gap-1.5 text-xs text-danger sm:mr-auto">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </span>
        )}
        {confirming ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? 'Removing…' : 'Confirm delete'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function CredentialListSkeleton() {
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
