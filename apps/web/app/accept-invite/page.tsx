'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/layout/logo';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';
import {
  acceptInvitation,
  getInvitationByToken,
  type InvitationInfo,
} from '@/lib/invitations';

function roleLabel(role: string, t: TranslateFn): string {
  const key = `roles.${role}` as TranslationKey;
  const label = t(key);
  // If the key is unknown, t() returns the key itself — fall back to the raw role.
  return label === key ? role : label;
}

/** Centered brand + card shell, matching the login/signup pages. */
function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="size-12" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t('accept.title')}
          </h1>
        </div>
        {children}
      </div>
    </main>
  );
}

function AcceptInviteInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [status, setStatus] = React.useState<'loading' | 'ready' | 'invalid' | 'done'>(
    'loading',
  );
  const [info, setInfo] = React.useState<InvitationInfo | null>(null);
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      if (!token) {
        setStatus('invalid');
        return;
      }
      try {
        const data = await getInvitationByToken(token);
        if (active) {
          setInfo(data);
          setStatus('ready');
        }
      } catch {
        if (active) setStatus('invalid');
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || password.trim().length < 8) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await acceptInvitation(token, {
        name: name.trim() || undefined,
        password: password.trim(),
      });
      setStatus('done');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('accept.error'));
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('accept.loading')}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (status === 'invalid') {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
              <TriangleAlert className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t('accept.invalidTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('accept.invalidBody')}</p>
            </div>
            <Button
              variant="secondary"
              size="md"
              className="mt-1"
              onClick={() => router.push('/login')}
            >
              {t('accept.goToLogin')}
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (status === 'done') {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success ring-1 ring-inset ring-success/25">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t('accept.successTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('accept.successBody')}</p>
            </div>
            <Button size="lg" className="mt-1 w-full" onClick={() => router.push('/login')}>
              {t('accept.goToLogin')}
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // status === 'ready'
  return (
    <Shell>
      <Card>
        <CardContent className="p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            {t('accept.subtitle', {
              org: info?.organizationName ?? '',
              role: info ? roleLabel(info.role, t) : '',
            })}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {formError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="accept-email" className="block text-sm font-medium text-foreground">
                {t('accept.email')}
              </label>
              <Input id="accept-email" type="email" value={info?.email ?? ''} readOnly dir="ltr" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="accept-name" className="block text-sm font-medium text-foreground">
                {t('accept.name')}
              </label>
              <Input
                id="accept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('accept.namePlaceholder')}
                maxLength={200}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="accept-password" className="block text-sm font-medium text-foreground">
                {t('accept.password')}
              </label>
              <Input
                id="accept-password"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">{t('accept.passwordHelp')}</p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || password.trim().length < 8}
            >
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? t('accept.submitting') : t('accept.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

export default function AcceptInvitePage() {
  return (
    <React.Suspense fallback={null}>
      <AcceptInviteInner />
    </React.Suspense>
  );
}
