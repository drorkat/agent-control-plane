import type { BadgeVariant } from '@/components/ui/badge';

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

/** Title-case an arbitrary status string for display (e.g. "idle" -> "Idle"). */
export function statusLabel(status: string): string {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
];
