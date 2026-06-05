import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { TTL_15M, TTL_1H } from './utils.js';
import { readCache, writeCache } from '../../utils/cache.js';

const BASE_URL = 'https://api.polygon.io';

function getApiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    throw new Error('[Polygon] POLYGON_API_KEY not set');
  }
  return key;
}

async function polygonFetch(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  ttlMs: number,
): Promise<{ data: Record<string, unknown>; url: string }> {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
  ) as Record<string, string | number>;
  const cached = readCache(endpoint, filtered, ttlMs);
  if (cached) {
    return cached;
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(filtered)) {
    url.searchParams.set(k, String(v));
  }
  url.searchParams.set('apiKey', getApiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`[Polygon] HTTP ${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  writeCache(endpoint, filtered, data, url.toString());
  return { data, url: url.toString() };
}

const PolygonTickerInputSchema = z.object({
  ticker: z.string().describe("Stock ticker symbol, e.g. 'NOW'"),
});

/**
 * Reference ticker metadata from Polygon.
 * Useful for consistent market cap / company profile fields.
 */
export const polygonGetTickerReference = new DynamicStructuredTool({
  name: 'polygon_get_ticker_reference',
  description:
    'Get standardized ticker reference data from Polygon (name, market cap, exchange, share class metadata).',
  schema: PolygonTickerInputSchema,
  func: async ({ ticker }) => {
    const symbol = ticker.trim().toUpperCase();
    const { data, url } = await polygonFetch(`/v3/reference/tickers/${symbol}`, {}, TTL_1H);
    const result = (data.result as Record<string, unknown> | undefined) ?? {};
    return formatToolResult(
      {
        ticker: symbol,
        name: result.name,
        market_cap: result.market_cap,
        primary_exchange: result.primary_exchange,
        type: result.type,
        locale: result.locale,
        active: result.active,
        weighted_shares_outstanding: result.weighted_shares_outstanding,
        branding: result.branding,
      },
      [url],
    );
  },
});

const PolygonFinancialsInputSchema = z.object({
  ticker: z.string().describe("Stock ticker symbol, e.g. 'NOW'"),
  limit: z.number().default(1).describe('Number of most recent filings to retrieve.'),
});

/**
 * Financials endpoint from Polygon.
 * Returns latest standardized filing payloads that can include EV/ratio-like fields.
 */
export const polygonGetFinancials = new DynamicStructuredTool({
  name: 'polygon_get_financials',
  description:
    'Get standardized financial filing payloads from Polygon for valuation/reference fields (latest filing-first).',
  schema: PolygonFinancialsInputSchema,
  func: async ({ ticker, limit }) => {
    const symbol = ticker.trim().toUpperCase();
    const { data, url } = await polygonFetch(
      '/vX/reference/financials',
      {
        ticker: symbol,
        limit,
        sort: 'filing_date',
        order: 'desc',
      },
      TTL_15M,
    );
    const results = Array.isArray(data.results) ? data.results : [];
    return formatToolResult(
      {
        ticker: symbol,
        count: results.length,
        results,
      },
      [url],
    );
  },
});

export const POLYGON_TOOLS = [polygonGetTickerReference, polygonGetFinancials];

