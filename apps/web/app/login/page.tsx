'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/layout/logo';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/context';
import { useI18n } from '@/lib/i18n/context';

export default function LoginPage() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/login', { email: email.trim(), password });
      // The login response set the session cookie; reconcile our auth state.
      await refresh();
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.authError'));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="size-12" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {t('auth.login.title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('auth.login.subtitle')}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  {t('auth.email')}
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  {t('auth.password')}
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                  disabled={submitting}
                />
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link
            href="/signup"
            className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {t('auth.createAccount')}
          </Link>
        </p>
      </div>
    </main>
  );
}
