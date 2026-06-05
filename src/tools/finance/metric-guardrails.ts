type Rec = Record<string, unknown>;

export type MetricKind = 'flow' | 'stock' | 'ratio';

export interface MetricGuardrailEntry {
  metric: string;
  value: unknown;
  kind: MetricKind;
  unit: string;
  period: string;
  source: string;
}

function normalizePeriod(raw: unknown, kind: MetricKind): string {
  const p = typeof raw === 'string' ? raw.trim() : '';
  if (p) return p;
  if (kind === 'stock') return 'snapshot';
  return 'unknown';
}

function normalizeUnit(raw: unknown, kind: MetricKind): string {
  const u = typeof raw === 'string' ? raw.trim() : '';
  if (u) return u;
  if (kind === 'ratio') return 'ratio';
  return kind === 'stock' || kind === 'flow' ? 'USD' : 'unknown';
}

function inferKind(metric: string): MetricKind {
  const m = metric.toLowerCase();
  if (
    m.includes('pe') ||
    m.includes('ev/') ||
    m.includes('peg') ||
    m.includes('beta') ||
    m.includes('margin') ||
    m.includes('roe') ||
    m.includes('roic') ||
    m.includes('ratio')
  ) {
    return 'ratio';
  }
  if (
    m.includes('market_cap') ||
    m.includes('total_assets') ||
    m.includes('total_liabilities') ||
    m.includes('cash')
  ) {
    return 'stock';
  }
  return 'flow';
}

function inferUnit(metric: string, kind: MetricKind): string {
  const m = metric.toLowerCase();
  if (kind === 'ratio') {
    if (m.includes('margin')) return '%';
    if (m.includes('pe') || m.includes('ev/') || m.includes('peg')) return 'x';
    return 'ratio';
  }
  if (m.includes('shares') || m.includes('employees')) return 'count';
  return 'USD';
}

/**
 * Build machine-readable metric metadata for downstream answer guardrails.
 * Allows snapshot metrics without period, and ratio metrics without strict units.
 */
export function buildMetricGuardrails(params: {
  tool: string;
  ticker?: string;
  sourceUrl?: string;
  metrics: Rec;
  period?: string;
}): MetricGuardrailEntry[] {
  const source = params.sourceUrl ?? params.tool;
  const rows: MetricGuardrailEntry[] = [];
  for (const [metric, value] of Object.entries(params.metrics)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const kind = inferKind(metric);
    const unit = normalizeUnit(undefined, kind) || inferUnit(metric, kind);
    const period = normalizePeriod(params.period, kind);
    rows.push({
      metric,
      value,
      kind,
      unit: unit === 'USD' ? inferUnit(metric, kind) : unit,
      period,
      source,
    });
  }
  return rows;
}

