'use client';

import * as React from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Info,
  Link2,
  Loader2,
  Mail,
  RotateCcw,
  Send,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/context';
import { canManage, type Role } from '@/lib/auth/roles';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';
import {
  listMembers,
  removeMember,
  updateMemberRole,
  type AssignableRole,
  type Member,
} from '@/lib/members';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  type Invitation,
} from '@/lib/invitations';
import { cn } from '@/lib/utils';

// ── role helpers ──────────────────────────────────────────────────────────

const ROLE_LABEL_KEYS: Record<Role, TranslationKey> = {
  owner: 'roles.owner',
  admin: 'roles.admin',
  member: 'roles.member',
  viewer: 'roles.viewer',
};

/** Translated role label, falling back to the raw value. */
function roleLabel(role: string, t: TranslateFn): string {
  const key = ROLE_LABEL_KEYS[role as Role];
  return key ? t(key) : role;
}

// A subtle chip color per role: owner stands out, the rest stay calm.
const ROLE_VARIANT: Record<Role, BadgeVariant> = {
  owner: 'primary',
  admin: 'warning',
  member: 'neutral',
  viewer: 'neutral',
};

function roleVariant(role: string): BadgeVariant {
  return ROLE_VARIANT[role as Role] ?? 'neutral';
}

// A manager can move an existing member to any role (PATCH allows `owner`)…
const ALL_ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];
// …but a brand-new member cannot be created as an `owner` (POST forbids it).
const ASSIGNABLE_ROLES: AssignableRole[] = ['admin', 'member', 'viewer'];

// ── shared styling (mirrors the settings page's <select> + label) ───────────

const fieldControl =
  'flex w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const labelClass = 'block text-sm font-medium text-foreground';

/** Locale-aware short date. */
function formatDate(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleDateString(lang, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Up-to-two-letter initials from a display name, falling back to the email. */
function initialsOf(name: string | null, email: string): string {
  const source = (name && name.trim()) || email;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Build the shareable accept link for a token (client-side origin). */
function inviteLink(token: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/accept-invite?token=${token}`;
}

/** A small copy-to-clipboard button that flips to "Copied" for ~2s. */
function CopyLinkButton({ value, t }: { value: string; t: TranslateFn }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy} type="button">
      {copied ? <Check /> : <Copy />}
      {copied ? t('team.linkCopied') : t('team.copyLink')}
    </Button>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isManager = canManage(user?.role);

  const [members, setMembers] = React.useState<Member[]>([]);
  const [invitations, setInvitations] = React.useState<Invitation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMembers();
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('team.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadInvitations = React.useCallback(async () => {
    if (!isManager) return;
    try {
      setInvitations(await listInvitations());
    } catch {
      // Non-managers 403 here; the roster notice already explains the limits.
    }
  }, [isManager]);

  React.useEffect(() => {
    void load();
    void loadInvitations();
  }, [load, loadInvitations]);

  const hasMembers = members.length > 0;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('team.title')}
              </h1>
              {!loading && !error && hasMembers && (
                <Badge variant="neutral">{members.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('team.subtitle')}</p>
          </div>

          {isManager && (
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              size="md"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? (
                <>
                  <X />
                  {t('common.cancel')}
                </>
              ) : (
                <>
                  <UserPlus />
                  {t('team.invite')}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Read-only notice for non-managers */}
        {!isManager && (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 translate-y-0.5" />
            <span>{t('team.onlyManagers')}</span>
          </div>
        )}

        {/* Inline invite form (managers only) */}
        {isManager && showForm && (
          <InviteForm
            onCreated={loadInvitations}
            onClose={() => setShowForm(false)}
            t={t}
          />
        )}

        {/* Members */}
        {loading ? (
          <MemberListSkeleton />
        ) : error ? (
          isManager ? (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
                    <TriangleAlert className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{t('team.loadError')}</p>
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">{error}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    <RotateCcw />
                    {t('common.tryAgain')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null
        ) : !hasMembers ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
              <Users className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">{t('team.empty')}</p>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-sm font-semibold text-foreground">{t('team.membersCount')}</h2>
              <Badge variant="neutral">{members.length}</Badge>
            </div>
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelf={member.id === user?.id}
                    isManager={isManager}
                    onChanged={load}
                    t={t}
                    lang={lang}
                  />
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Pending invitations (managers only) */}
        {isManager && (
          <PendingInvitations
            invitations={invitations}
            onChanged={loadInvitations}
            t={t}
            lang={lang}
          />
        )}
      </div>
    </AppShell>
  );
}

// ── invite form ──────────────────────────────────────────────────────────────

function InviteForm({
  onCreated,
  onClose,
  t,
}: {
  onCreated: () => void | Promise<void>;
  onClose: () => void;
  t: TranslateFn;
}) {
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<AssignableRole>('member');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Invitation | null>(null);

  const canSubmit = email.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const invite = await createInvitation(email.trim(), role);
      setCreated(invite);
      await onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('team.inviteError'));
    } finally {
      setSubmitting(false);
    }
  }

  // After creating, show the shareable link instead of the form.
  if (created) {
    const link = inviteLink(created.token);
    return (
      <Card className="animate-fade-up border-primary/30">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
              <Check className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {t('team.inviteCreated')}
              </h2>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">
                {created.email}
              </p>
            </div>
          </div>

          <label className={cn(labelClass, 'mb-1.5')}>{t('team.inviteLink')}</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input value={link} readOnly dir="ltr" onFocus={(e) => e.currentTarget.select()} />
            <CopyLinkButton value={link} t={t} />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0 translate-y-0.5" />
            {t('team.inviteLinkHelp')}
          </p>

          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setCreated(null);
                setEmail('');
                onClose();
              }}
            >
              {t('team.done')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-up">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-[18px]" />
          </span>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t('team.inviteTitle')}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="invite-email" className={labelClass}>
                {t('team.email')} <span className="text-danger">*</span>
              </label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('team.emailPlaceholder')}
                autoComplete="off"
                dir="ltr"
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-role" className={labelClass}>
                {t('team.role')}
              </label>
              <select
                id="invite-role"
                className={cn(fieldControl, 'h-9 py-1')}
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
                disabled={submitting}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r, t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse items-stretch gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
            {formError && (
              <p className="flex items-center gap-1.5 text-sm text-danger sm:me-auto">
                <TriangleAlert className="size-4 shrink-0" />
                {formError}
              </p>
            )}
            <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="md" disabled={submitting || !canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t('team.inviting')}
                </>
              ) : (
                <>
                  <Send />
                  {t('team.inviteSubmit')}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── pending invitations ──────────────────────────────────────────────────────

function PendingInvitations({
  invitations,
  onChanged,
  t,
  lang,
}: {
  invitations: Invitation[];
  onChanged: () => void | Promise<void>;
  t: TranslateFn;
  lang: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">{t('team.pending')}</h2>
        {invitations.length > 0 && <Badge variant="neutral">{invitations.length}</Badge>}
      </div>
      {invitations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('team.pendingEmpty')}
        </p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {invitations.map((inv) => (
              <InvitationRow key={inv.id} invitation={inv} onChanged={onChanged} t={t} lang={lang} />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function InvitationRow({
  invitation,
  onChanged,
  t,
  lang,
}: {
  invitation: Invitation;
  onChanged: () => void | Promise<void>;
  t: TranslateFn;
  lang: string;
}) {
  const [revoking, setRevoking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const link = inviteLink(invitation.token);

  async function handleRevoke() {
    setRevoking(true);
    setError(null);
    try {
      await revokeInvitation(invitation.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('team.revokeError'));
      setRevoking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground" dir="ltr">
              {invitation.email}
            </span>
            <Badge variant={roleVariant(invitation.role)}>
              {t('team.invitedRole', { role: roleLabel(invitation.role, t) })}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5 shrink-0" />
            {t('team.expires', { date: formatDate(invitation.expiresAt, lang) })}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {error && (
          <span className="flex items-center gap-1.5 text-xs text-danger sm:me-auto">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </span>
        )}
        <CopyLinkButton value={link} t={t} />
        <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={revoking}>
          {revoking ? <Loader2 className="animate-spin" /> : <Trash2 />}
          {revoking ? t('team.revoking') : t('team.revoke')}
        </Button>
      </div>
    </div>
  );
}

// ── member row ────────────────────────────────────────────────────────────

function MemberRow({
  member,
  isSelf,
  isManager,
  onChanged,
  t,
  lang,
}: {
  member: Member;
  isSelf: boolean;
  isManager: boolean;
  onChanged: () => void | Promise<void>;
  t: TranslateFn;
  lang: string;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [updatingRole, setUpdatingRole] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const displayName = (member.name && member.name.trim()) || member.email;

  async function handleRoleChange(next: Role) {
    if (next === member.role) return;
    setUpdatingRole(true);
    setError(null);
    try {
      await updateMemberRole(member.id, next);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('team.roleUpdateError'));
      setUpdatingRole(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      await removeMember(member.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('team.removeError'));
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Identity */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/15">
          {initialsOf(member.name, member.email)}
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            {isSelf && <Badge variant="primary">{t('team.you')}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate" dir="ltr">
              {member.email}
            </span>
            <span>{t('team.memberSince', { date: formatDate(member.createdAt, lang) })}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {error && (
          <span className="flex items-center gap-1.5 text-xs text-danger sm:me-auto">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </span>
        )}

        {isManager ? (
          <>
            <div className="relative">
              <select
                aria-label={t('team.changeRole')}
                className={cn(fieldControl, 'h-9 py-1', updatingRole && 'pe-8')}
                value={member.role}
                onChange={(e) => void handleRoleChange(e.target.value as Role)}
                disabled={isSelf || removing || updatingRole}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r, t)}
                  </option>
                ))}
              </select>
              {updatingRole && (
                <Loader2 className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {confirming ? (
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <span className="text-xs text-muted-foreground">{t('team.confirmRemove')}</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={removing}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleRemove} disabled={removing}>
                    {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    {removing ? t('team.removing') : t('team.remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={isSelf || removing}
              >
                <Trash2 />
                {t('team.remove')}
              </Button>
            )}
          </>
        ) : (
          <Badge variant={roleVariant(member.role)}>{roleLabel(member.role, t)}</Badge>
        )}
      </div>
    </div>
  );
}

// ── skeleton ────────────────────────────────────────────────────────────────

function MemberListSkeleton() {
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-muted" />
              <div className="h-3 w-52 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
