/**
 * Runtime profiles define iteration limits and defaults per deployment surface.
 * Explicit maxIterations on AgentConfig always wins.
 */
export type RuntimeProfileId = 'research' | 'messaging' | 'maintenance';

export interface RuntimeProfile {
  /** Max agent loop iterations for this surface */
  maxIterations: number;
}

export const RUNTIME_PROFILES: Record<RuntimeProfileId, RuntimeProfile> = {
  /** CLI deep research */
  research: { maxIterations: 20 },
  /** WhatsApp / gateway conversational turns */
  messaging: { maxIterations: 10 },
  /** Cron jobs and heartbeat checks */
  maintenance: { maxIterations: 6 },
};

export function getRuntimeProfile(id: RuntimeProfileId): RuntimeProfile {
  return RUNTIME_PROFILES[id];
}

export function resolveMaxIterations(
  config: { maxIterations?: number; runtimeProfile?: RuntimeProfileId },
): number {
  if (config.maxIterations != null) {
    return config.maxIterations;
  }
  const profile = config.runtimeProfile ?? 'research';
  return RUNTIME_PROFILES[profile].maxIterations;
}
