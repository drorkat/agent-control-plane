'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  FolderKanban,
  FolderPlus,
  GitBranch,
  Github,
  Loader2,
  Plus,
  RefreshCw,
  TriangleAlert,
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

// Mirrors the design-system <Input> so the multi-line description field reads as
// part of the same family without introducing any global styles.
const textareaClass = cn(
  'flex min-h-[84px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs',
  'transition-colors placeholder:text-muted-foreground resize-none',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

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

function ProjectCard({ project, t }: { project: Project; t: TranslateFn }) {
  const connected = Boolean(project.repoUrl);
  const hasGithubRepo = Boolean(project.repoOwner && project.repoName);
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full transition-shadow duration-200 hover:shadow-md">
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FolderKanban className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('common.createdOn', { date: formatDate(project.createdAt) })}
                </p>
              </div>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </div>

          <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {project.description?.trim() || t('common.noDescription')}
          </p>

          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 pt-1">
            {hasGithubRepo ? (
              <Badge variant="primary" className="max-w-full">
                <Github className="size-3 shrink-0" />
                <span className="truncate" dir="ltr">
                  {project.repoOwner}/{project.repoName}
                </span>
              </Badge>
            ) : connected ? (
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
        </CardContent>
      </Card>
    </Link>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-4 h-5 w-28 animate-pulse rounded-full bg-muted" />
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { t } = useI18n();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [repoUrl, setRepoUrl] = React.useState('');
  const [repoOwner, setRepoOwner] = React.useState('');
  const [repoName, setRepoName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Project[]>('/projects');
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('projects.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName('');
    setDescription('');
    setRepoUrl('');
    setRepoOwner('');
    setRepoName('');
    setFormError(null);
  }

  function openForm() {
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t('projects.form.nameRequired'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.post<Project>('/projects', {
        name: trimmedName,
        description: description.trim() || undefined,
        repoUrl: repoUrl.trim() || undefined,
        repoOwner: repoOwner.trim() || undefined,
        repoName: repoName.trim() || undefined,
      });
      // The API returns rows newest-first, so prepend to keep them in sync.
      setProjects((prev) => [created, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('projects.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  const hasProjects = projects.length > 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('projects.title')}
              </h1>
              {!loading && !error && hasProjects && (
                <Badge variant="neutral">{projects.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('projects.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              size="md"
              onClick={() => (showForm ? closeForm() : openForm())}
            >
              {showForm ? (
                <>
                  <X />
                  {t('common.cancel')}
                </>
              ) : (
                <>
                  <Plus />
                  {t('projects.new')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Inline create form */}
        {showForm && (
          <Card className="animate-fade-up">
            <CardContent className="p-5">
              <form onSubmit={handleCreate} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="project-name" className="text-sm font-medium text-foreground">
                    {t('common.name')} <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('projects.form.namePlaceholder')}
                    maxLength={200}
                    autoFocus
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="project-description"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('common.description')}
                  </label>
                  <textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t('projects.form.descriptionPlaceholder')}
                    maxLength={2000}
                    rows={3}
                    disabled={submitting}
                    className={textareaClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-repo" className="text-sm font-medium text-foreground">
                    {t('projects.form.repoUrl')}
                  </label>
                  <Input
                    id="project-repo"
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    placeholder="https://github.com/org/repo"
                    maxLength={500}
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">{t('projects.form.repoHint')}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="project-repo-owner"
                      className="text-sm font-medium text-foreground"
                    >
                      {t('projects.repoOwner')}
                    </label>
                    <Input
                      id="project-repo-owner"
                      value={repoOwner}
                      onChange={(event) => setRepoOwner(event.target.value)}
                      placeholder={t('projects.repoOwnerPlaceholder')}
                      maxLength={200}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="project-repo-name"
                      className="text-sm font-medium text-foreground"
                    >
                      {t('projects.repoName')}
                    </label>
                    <Input
                      id="project-repo-name"
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      placeholder={t('projects.repoNamePlaceholder')}
                      maxLength={200}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse items-stretch gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
                  {formError && (
                    <p className="flex items-center gap-1.5 text-sm text-danger sm:me-auto">
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
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" size="md" disabled={submitting || !name.trim()}>
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        {t('common.creating')}
                      </>
                    ) : (
                      <>
                        <Plus />
                        {t('projects.create')}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
                  <TriangleAlert className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t('projects.loadErrorTitle')}
                  </p>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">{error}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  <RefreshCw />
                  {t('common.tryAgain')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : hasProjects ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} t={t} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
              <FolderPlus className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t('projects.emptyTitle')}</p>
              <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                {t('projects.emptyDesc')}
              </p>
            </div>
            {!showForm && (
              <Button variant="secondary" size="sm" onClick={openForm}>
                <Plus />
                {t('projects.new')}
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
