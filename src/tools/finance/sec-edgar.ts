import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { readCache, writeCache } from '../../utils/cache.js';
import { TTL_24H } from './utils.js';

const SEC_TICKER_CIK_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_XBRL_COMPANYFACTS_BASE = 'https://data.sec.gov/api/xbrl/companyfacts/CIK';

const SEC_USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT ||
  'Dexter/1.0 (research tool; contact: support@example.com)';

type TickerMapRecord = {
  cik_str: number;
  ticker: string;
  title: string;
};

async function secFetch(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': SEC_USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`[SEC EDGAR] HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function getTickerMap(): Promise<Record<string, TickerMapRecord>> {
  const cacheKey = '/sec/company_tickers';
  const cached = readCache(cacheKey, {}, TTL_24H);
  if (cached?.data && typeof cached.data === 'object') {
    return cached.data as Record<string, TickerMapRecord>;
  }
  const data = await secFetch(SEC_TICKER_CIK_URL);
  writeCache(cacheKey, {}, data, SEC_TICKER_CIK_URL);
  return data as Record<string, TickerMapRecord>;
}

async function resolveCik(ticker: string): Promise<{ cik: string; company?: string }> {
  const map = await getTickerMap();
  const symbol = ticker.trim().toUpperCase();
  for (const rec of Object.values(map)) {
    if (rec.ticker?.toUpperCase() === symbol) {
      return {
        cik: String(rec.cik_str).padStart(10, '0'),
        company: rec.title,
      };
    }
  }
  throw new Error(`[SEC EDGAR] CIK not found for ticker ${symbol}`);
}

function latestUnitValue(facts: Record<string, unknown>, usGaapTag: string): Record<string, unknown> | null {
  const usGaap = facts['us-gaap'] as Record<string, unknown> | undefined;
  const tagNode = usGaap?.[usGaapTag] as Record<string, unknown> | undefined;
  const units = tagNode?.units as Record<string, unknown> | undefined;
  if (!units) return null;

  const candidates: Record<string, unknown>[] = [];
  for (const arr of Object.values(units)) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === 'object') {
          candidates.push(item as Record<string, unknown>);
        }
      }
    }
  }

  candidates.sort((a, b) => {
    const ad = String(a.end ?? a.filed ?? '');
    const bd = String(b.end ?? b.filed ?? '');
    return bd.localeCompare(ad);
  });
  return candidates[0] ?? null;
}

const SecCompanyFactsInputSchema = z.object({
  ticker: z.string().describe("Stock ticker symbol, e.g. 'NOW'"),
  tags: z
    .array(z.string())
    .default(['StockBasedCompensation', 'RemainingPerformanceObligation'])
    .describe('us-gaap fact tags to extract (latest value per tag).'),
});

/**
 * Pulls canonical XBRL company facts directly from SEC EDGAR.
 * Use for high-trust SaaS metrics and accounting line items (e.g. SBC).
 */
export const secEdgarGetCompanyFacts = new DynamicStructuredTool({
  name: 'sec_edgar_get_company_facts',
  description:
    'Fetch latest SEC EDGAR XBRL company facts by ticker and us-gaap tags (authoritative source for accounting metrics).',
  schema: SecCompanyFactsInputSchema,
  func: async ({ ticker, tags }) => {
    const symbol = ticker.trim().toUpperCase();
    const { cik, company } = await resolveCik(symbol);
    const url = `${SEC_XBRL_COMPANYFACTS_BASE}${cik}.json`;
    const factsPayload = await secFetch(url);
    const facts = (factsPayload.facts as Record<string, unknown> | undefined) ?? {};

    const extracted: Record<string, unknown> = {};
    for (const tag of tags) {
      extracted[tag] = latestUnitValue(facts, tag);
    }

    return formatToolResult(
      {
        ticker: symbol,
        cik,
        company,
        extracted,
      },
      [url],
    );
  },
});

