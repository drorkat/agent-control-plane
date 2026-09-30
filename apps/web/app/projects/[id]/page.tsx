'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  FolderKanban,
  GitBranch,
  Github,
  Hash,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';

type Project = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link
      href="/projects"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ArrowLeft className="size-4 rtl:-scale-x-100" />
      {t('projects.detail.back')}
    </Link>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        {label}
      </span>
      <span className="min-w-0 text-end text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string | string[] }>();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();

  const [project, setProject] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Project>(`/projects/${id}`);
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('projects.loadError'));
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
      await api.delete(`/projects/${id}`);
      router.push('/projects');
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('projects.detail.deleteError'));
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <BackLink />

        {loading ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="size-12 animate-pulse rounded-xl bg-muted" />
              <div className="space-y-2">
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <Card>
              <CardContent className="space-y-3 p-6">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          </div>
        ) : error || !project ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
                  <TriangleAlert className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t('projects.detail.loadErrorTitle')}
                  </p>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {error ?? t('projects.detail.notFound')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    <RefreshCw />
                    {t('common.tryAgain')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
                    {t('projects.detail.back')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FolderKanban className="size-6" />
                </span>
                <div className="min-w-0 space-y-1.5">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                    {project.name}
                  </h1>
                  {project.repoUrl ? (
                    <Badge variant="success">
                      <GitBranch className="size-3" />
                      {t('common.repoConnected')}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" dot>
                      {t('common.noRepo')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <Card>
              <CardHeader>
                <CardTitle>{t('common.overview')}</CardTitle>
                <CardDescription>{t('projects.detail.overviewDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {t('common.description')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {project.description?.trim() || (
                      <span className="text-muted-foreground">{t('common.noDescription')}</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {t('projects.detail.repository')}
                  </p>
                  {project.repoOwner && project.repoName && (
                    <div>
                      <a
                        href={`https://github.com/${project.repoOwner}/${project.repoName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        title={t('projects.viewRepo')}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <Github className="size-4 shrink-0" />
                        <span className="truncate">
                          {project.repoOwner}/{project.repoName}
                        </span>
                        <ExternalLink className="size-3.5 shrink-0" />
                      </a>
                    </div>
                  )}
                  {project.repoUrl ? (
                    <div>
                      {isHttpUrl(project.repoUrl) ? (
                        <a
                          href={project.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 break-all text-sm font-medium text-primary transition-colors hover:underline"
                        >
                          <GitBranch className="size-4 shrink-0" />
                          <span className="truncate">{project.repoUrl}</span>
                          <ExternalLink className="size-3.5 shrink-0" />
                        </a>
                      ) : (
                        <code className="break-all rounded-md bg-muted px-2 py-1 font-mono text-sm text-foreground">
                          {project.repoUrl}
                        </code>
                      )}
                    </div>
                  ) : project.repoOwner && project.repoName ? null : (
                    <p className="text-sm text-muted-foreground">
                      {t('projects.detail.noRepoLinked')}
                    </p>
                  )}
                </div>

                <div className="divide-y divide-border border-t border-border">
                  <MetaRow icon={CalendarPlus} label={t('common.created')}>
                    {formatDateTime(project.createdAt)}
                  </MetaRow>
                  <MetaRow icon={CalendarClock} label={t('common.lastUpdated')}>
                    {formatDateTime(project.updatedAt)}
                  </MetaRow>
                  <MetaRow icon={Hash} label={t('projects.detail.projectId')}>
                    <code className="break-all font-mono text-xs text-muted-foreground">
                      {project.id}
                    </code>
                  </MetaRow>
                </div>
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="border-danger/30">
              <CardHeader>
                <CardTitle className="text-danger">{t('common.dangerZone')}</CardTitle>
                <CardDescription>{t('projects.detail.dangerDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {deleteError && (
                  <p className="mb-3 flex items-center gap-1.5 text-sm text-danger">
                    <TriangleAlert className="size-4 shrink-0" />
                    {deleteError}
                  </p>
                )}
                {confirming ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {t('projects.detail.confirmDeleteBefore')}{' '}
                      <span className="font-semibold">{project.name}</span>
                      {t('projects.detail.confirmDeleteAfter')}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirming(false)}
                        disabled={deleting}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                        {deleting ? (
                          <>
                            <Loader2 className="animate-spin" />
                            {t('common.deleting')}
                          </>
                        ) : (
                          <>
                            <Trash2 />
                            {t('projects.detail.deleteButton')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => {
                      setDeleteError(null);
                      setConfirming(true);
                    }}
                  >
                    <Trash2 />
                    {t('projects.detail.deleteButton')}
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
