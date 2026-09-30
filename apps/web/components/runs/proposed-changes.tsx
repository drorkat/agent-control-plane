import * as React from 'react';
import { FileCode2, FileDiff, FilePlus2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProposedFileChange } from '@/app/runs/types';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';

type DiffLine = { type: 'add' | 'del' | 'ctx'; text: string };

/**
 * A minimal LCS-based line diff of two texts. Content is capped upstream
 * (~20k chars), so the O(n·m) table is fine here. Returns a flat list of
 * added / removed / context lines in order.
 */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return out;
}

const LINE_STYLE: Record<DiffLine['type'], string> = {
  add: 'bg-success/10 text-foreground',
  del: 'bg-danger/10 text-muted-foreground',
  ctx: 'text-muted-foreground',
};
const LINE_SIGN: Record<DiffLine['type'], string> = { add: '+', del: '-', ctx: ' ' };

/** The diff (or full new content) for one proposed file. */
function FileChange({ file, t }: { file: ProposedFileChange; t: TranslateFn }) {
  const isNew = file.previousContent === undefined;
  const diff = React.useMemo(
    () => (isNew ? null : diffLines(file.previousContent ?? '', file.content)),
    [isNew, file.previousContent, file.content],
  );
  const added = diff ? diff.filter((l) => l.type === 'add').length : 0;
  const removed = diff ? diff.filter((l) => l.type === 'del').length : 0;

  return (
    <li className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        {isNew ? (
          <FilePlus2 className="size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <FileCode2
            className="size-4 shrink-0 text-muted-foreground"
            aria-label={t('runs.changes.file')}
          />
        )}
        <span
          dir="ltr"
          className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-foreground"
          title={file.path}
        >
          {file.path}
        </span>
        {isNew ? (
          <Badge variant="success">{t('runs.changes.newFile')}</Badge>
        ) : (
          <span className="shrink-0 font-mono text-xs">
            <span className="text-success">+{added}</span>{' '}
            <span className="text-danger">-{removed}</span>
          </span>
        )}
      </div>

      {isNew || !diff ? (
        <pre
          dir="ltr"
          className="max-h-80 overflow-auto bg-card p-3 text-xs leading-relaxed text-foreground"
        >
          <code className="font-mono">{file.content}</code>
        </pre>
      ) : (
        <div dir="ltr" className="max-h-80 overflow-auto bg-card font-mono text-xs leading-relaxed">
          {diff.map((line, idx) => (
            <div
              key={idx}
              className={cn('flex whitespace-pre-wrap break-words px-3', LINE_STYLE[line.type])}
            >
              <span aria-hidden className="me-2 shrink-0 select-none opacity-60">
                {LINE_SIGN[line.type]}
              </span>
              <span className="min-w-0 flex-1">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * The "Proposed changes" card for a run: the agent's summary, a changed-file
 * count, and each proposed file rendered as a before/after diff (when the agent
 * read the original) or as full content for a new file. Empty state when the run
 * proposed no edits. Code is forced `dir="ltr"` so it reads correctly under RTL.
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
                <FileChange key={`${file.path}-${i}`} file={file} t={t} />
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
