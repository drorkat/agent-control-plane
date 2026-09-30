import * as React from 'react';
import { FileCode2, FileDiff } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ProposedFileChange } from '@/app/runs/types';
import type { TranslateFn } from '@/lib/i18n/dictionary';

/**
 * The "Proposed changes" card for a run: the agent's summary, a changed-file
 * count, and each proposed file's path plus its full content in a scrollable,
 * monospaced block. Renders an empty state when `changes` is null (e.g. the run
 * only read repository context but proposed no edits).
 *
 * Code content and file paths are forced to `dir="ltr"` so they read correctly
 * under a right-to-left UI; long content scrolls inside a capped-height block.
 */
export function ProposedChanges({
  changes,
  t,
}: {
  changes: { summary: string; files: ProposedFileChange[] } | null;
  t: TranslateFn;
}) {
  const files = changes?.files ?? [];
  const hasFiles = files.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDiff className="size-4 text-muted-foreground" />
          {t('runs.changes.title')}
        </CardTitle>
        <CardDescription>{t('runs.changes.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {changes && changes.summary && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('runs.changes.summary')}
            </p>
            <p
              dir="auto"
              className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground"
            >
              {changes.summary}
            </p>
          </div>
        )}

        {hasFiles ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {t('runs.changes.filesChanged', { count: files.length })}
            </p>
            <ul className="space-y-3">
              {files.map((file, i) => (
                <li
                  key={`${file.path}-${i}`}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                    <FileCode2
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-label={t('runs.changes.file')}
                    />
                    <span
                      dir="ltr"
                      className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-foreground"
                      title={file.path}
                    >
                      {file.path}
                    </span>
                  </div>
                  <pre
                    dir="ltr"
                    className="max-h-80 overflow-auto bg-card p-3 text-xs leading-relaxed text-foreground"
                  >
                    <code className="font-mono">{file.content}</code>
                  </pre>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('runs.changes.empty')}</p>
        )}
      </CardContent>
    </Card>
  );
}
