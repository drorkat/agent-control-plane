import type { BadgeVariant } from '@/components/ui/badge';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';

export type AgentStatus = 'idle' | 'working' | 'paused';

/** Shape returned by the API for an agent (dates arrive as ISO strings). */
export interface Agent {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  role: string | null;
  instructions: string | null;
  provider: string;
  model: string;
  autonomyLevel: number;
  status: AgentStatus | string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

/** Human-friendly provider name, falling back to a capitalized value. */
export function providerLabel(provider: string): string {
  const key = provider.toLowerCase();
  return PROVIDER_LABELS[key] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Map an agent status to a design-system Badge variant. */
export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'working':
      return 'success';
    case 'paused':
      return 'warning';
    case 'idle':
    default:
      return 'neutral';
  }
}

const STATUS_LABEL_KEYS: Record<AgentStatus, TranslationKey> = {
  idle: 'agents.status.idle',
  working: 'agents.status.working',
  paused: 'agents.status.paused',
};

/**
 * Translated status name. Falls back to the "unknown" label for an empty
 * status, or to a title-cased raw value for an unexpected one.
 */
export function statusLabel(status: string, t: TranslateFn): string {
  if (!status) return t('agents.status.unknown');
  const key = STATUS_LABEL_KEYS[status as AgentStatus];
  if (key) return t(key);
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
];
