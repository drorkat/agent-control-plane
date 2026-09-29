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

type Project = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
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
  return (
    <Link
      href="/projects"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ArrowLeft className="size-4" />
      Back to projects
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
      <span className="min-w-0 text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export default function ProjectDetailPage() {
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
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

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
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project');
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
                  <p className="text-sm font-semibold text-foreground">Couldn&apos;t load project</p>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {error ?? 'This project could not be found.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    <RefreshCw />
                    Try again
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
                    Back to projects
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
                      Repo connected
                    </Badge>
                  ) : (
                    <Badge variant="neutral" dot>
                      No repo
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>Details for this project.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Description
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {project.description?.trim() || (
                      <span className="text-muted-foreground">No description provided.</span>
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Repository
                  </p>
                  {project.repoUrl ? (
                    isHttpUrl(project.repoUrl) ? (
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
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
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">No repository linked.</p>
                  )}
                </div>

                <div className="divide-y divide-border border-t border-border">
                  <MetaRow icon={CalendarPlus} label="Created">
                    {formatDateTime(project.createdAt)}
                  </MetaRow>
                  <MetaRow icon={CalendarClock} label="Last updated">
                    {formatDateTime(project.updatedAt)}
                  </MetaRow>
                  <MetaRow icon={Hash} label="Project ID">
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
                <CardTitle className="text-danger">Danger zone</CardTitle>
                <CardDescription>
                  Deleting a project permanently removes it. This cannot be undone.
                </CardDescription>
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
                      Delete <span className="font-semibold">{project.name}</span>? This can&apos;t be
                      undone.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirming(false)}
                        disabled={deleting}
                      >
                        Cancel
                      </Button>
                      <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                        {deleting ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          <>
                            <Trash2 />
                            Delete project
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
                    Delete project
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
