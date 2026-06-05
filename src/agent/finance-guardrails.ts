type ToolCallRecord = { tool: string; args: Record<string, unknown>; result: string };

type GuardrailEntry = {
  metric: string;
  value: unknown;
  kind: 'flow' | 'stock' | 'ratio';
  unit: string;
  period: string;
  source: string;
};

function collectGuardrailEntries(toolCalls: ToolCallRecord[]): GuardrailEntry[] {
  const entries: GuardrailEntry[] = [];
  for (const call of toolCalls) {
    if (call.tool !== 'get_financials') continue;
    try {
      const parsed = JSON.parse(call.result) as { data?: Record<string, unknown> };
      const data = parsed.data;
      if (!data || typeof data !== 'object') continue;
      const meta = data._metricGuardrails as Record<string, unknown> | undefined;
      if (!meta) continue;
      for (const rows of Object.values(meta)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (row && typeof row === 'object') {
            const rec = row as GuardrailEntry;
            if (rec.metric && rec.source && rec.period && rec.unit) {
              entries.push(rec);
            }
          }
        }
      }
    } catch {
      // ignore malformed tool results
    }
  }
  return entries;
}

function hasAnyNumber(text: string): boolean {
  return /\b\d[\d,.]*(?:%|x|b|m|k|t)?\b/i.test(text);
}

/**
 * Harden finance answers: if numeric claims exist but no guardrail metadata from
 * get_financials was collected, replace with explicit N/A notice.
 *
 * This is intentionally conservative in V1 to avoid regex-based false positives.
 */
export function enforceFinanceAnswerGuardrails(
  answer: string,
  toolCalls: ToolCallRecord[],
): string {
  const lower = answer.toLowerCase();
  const financeLike =
    lower.includes('revenue') ||
    lower.includes('margin') ||
    lower.includes('pe') ||
    lower.includes('ev/') ||
    lower.includes('free cash flow') ||
    lower.includes('market cap') ||
    lower.includes('估值') ||
    lower.includes('营收') ||
    lower.includes('利润') ||
    lower.includes('市值');

  if (!financeLike || !hasAnyNumber(answer)) {
    return answer;
  }

  const guardrails = collectGuardrailEntries(toolCalls);
  if (guardrails.length > 0) {
    return answer;
  }

  return `${answer}\n\n[Guardrail] Numeric finance claims replaced with N/A because source+period+unit metadata was unavailable from get_financials.`;
}

