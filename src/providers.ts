import { getSetting } from './utils/config.js';

/**
 * Canonical provider registry — single source of truth for all provider metadata.
 * When adding a new provider, add a single entry here; all other modules derive from this.
 */

export interface ProviderDef {
  /** Slug used in config/settings (e.g., 'anthropic') */
  id: string;
  /** Human-readable name (e.g., 'Anthropic') */
  displayName: string;
  /** Model name prefix used for routing (e.g., 'claude-'). Empty string for default (OpenAI). */
  modelPrefix: string;
  /** Environment variable name for API key. Omit for local providers (e.g., Ollama). */
  apiKeyEnvVar?: string;
  /** Fast model variant for lightweight tasks like summarization. */
  fastModel?: string;
  /** Default context window size in tokens. Used for model-aware compaction thresholds. */
  contextWindow?: number;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    modelPrefix: '',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    fastModel: 'gpt-5.4-mini',
    contextWindow: 1_047_576,
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    modelPrefix: 'claude-',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    fastModel: 'claude-haiku-4-5',
    contextWindow: 200_000,
  },
  {
    id: 'google',
    displayName: 'Google',
    modelPrefix: 'gemini-',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    fastModel: 'gemini-3-flash-preview',
    contextWindow: 1_000_000,
  },
  {
    id: 'xai',
    displayName: 'xAI',
    modelPrefix: 'grok-',
    apiKeyEnvVar: 'XAI_API_KEY',
    fastModel: 'grok-4-1-fast-reasoning',
    contextWindow: 131_072,
  },
  {
    id: 'moonshot',
    displayName: 'Moonshot',
    modelPrefix: 'kimi-',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    fastModel: 'kimi-k2-5',
    contextWindow: 131_072,
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    modelPrefix: 'deepseek-',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    fastModel: 'deepseek-v4-flash',
    contextWindow: 1_000_000,
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    modelPrefix: 'openrouter:',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    fastModel: 'openrouter:openai/gpt-4o-mini',
    contextWindow: 128_000,
  },
  {
  id: 'groq',
  displayName: 'Groq',
  modelPrefix: 'groq:',
  apiKeyEnvVar: 'GROQ_API_KEY',
  fastModel: 'groq:llama-3.3-70b-versatile',
  contextWindow: 128_000,
  },
  {
  id: 'cerebras',
  displayName: 'Cerebras',
  modelPrefix: 'cerebras:',
  apiKeyEnvVar: 'CEREBRAS_API_KEY',
  // Production tool-calling model (see inference-docs.cerebras.ai/models/overview).
  // Preview alternative for agentic routing: cerebras:zai-glm-4.7 via ROUTER_MODEL.
  fastModel: 'cerebras:gpt-oss-120b',
  contextWindow: 128_000,
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    modelPrefix: 'ollama:',
    contextWindow: 128_000,
  },
];

const defaultProvider = PROVIDERS.find((p) => p.id === 'deepseek')!;

/** Legacy / API model ids without a provider prefix */
const MODEL_PROVIDER_ALIASES: Record<string, string> = {
  'deepseek-chat': 'deepseek',
  'deepseek-reasoner': 'deepseek',
};

/**
 * Resolve the provider for a given model name based on its prefix.
 * Falls back to DeepSeek when no prefix matches (matches DEFAULT_PROVIDER).
 */
export function resolveProvider(modelName: string): ProviderDef {
  const aliasId = MODEL_PROVIDER_ALIASES[modelName];
  if (aliasId) {
    return getProviderById(aliasId) ?? defaultProvider;
  }
  const byPrefix = PROVIDERS.find((p) => p.modelPrefix && modelName.startsWith(p.modelPrefix));
  if (byPrefix) {
    return byPrefix;
  }

  const configuredId = getSetting('provider', defaultProvider.id);
  return getProviderById(configuredId) ?? defaultProvider;
}

export function getFastModel(modelProvider: string, fallbackModel: string): string {
  return getProviderById(modelProvider)?.fastModel ?? fallbackModel;
}

/**
 * Default model for meta-tool LLM routing (tool selection only).
 * Kept separate from the main agent model: DeepSeek is used for reasoning, while
 * Cerebras/Groq handle fast native tool-calling for finance/market/filing routers.
 */
export const DEFAULT_ROUTER_MODEL = 'cerebras:gpt-oss-120b';

function isApiKeyConfigured(envVar?: string): boolean {
  if (!envVar) {
    return false;
  }
  const value = process.env[envVar]?.trim();
  return Boolean(value && !value.startsWith('your-'));
}

/**
 * Model for nested meta-tools (get_financials, get_market_data, read_filings, etc.).
 * Priority: ROUTER_MODEL env → Cerebras (if key) → Groq (if key) → main agent fast model.
 */
export function resolveRouterModel(agentModel: string): string {
  const envModel = process.env.ROUTER_MODEL?.trim();
  if (envModel) {
    return envModel;
  }

  const cerebras = getProviderById('cerebras');
  if (cerebras && isApiKeyConfigured(cerebras.apiKeyEnvVar)) {
    return DEFAULT_ROUTER_MODEL;
  }

  const groq = getProviderById('groq');
  if (groq && isApiKeyConfigured(groq.apiKeyEnvVar)) {
    return groq.fastModel ?? 'groq:llama-3.3-70b-versatile';
  }

  const provider = resolveProvider(agentModel);
  return getFastModel(provider.id, agentModel);
}

/**
 * Look up a provider by its slug (e.g., 'anthropic', 'google').
 */
export function getProviderById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
