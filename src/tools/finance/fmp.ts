import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

const BASE_URL = 'https://financialmodelingprep.com/api/v3';

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('[FMP] FMP_API_KEY not set');
  return key;
}

async function fmpFetch(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('apikey', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`[FMP] HTTP ${res.status}`);
  return res.json();
}

// ── 1. 实时股价快照 ──────────────────────────────────────────────
export const fmpGetQuote = new DynamicStructuredTool({
  name: 'fmp_get_quote',
  description: 'Get real-time stock quote (price, change, volume, 52-week high/low, PE ratio, market cap) from Financial Modeling Prep.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  }),
  func: async ({ ticker }) => {
    const data = await fmpFetch(`/quote/${ticker}`) as unknown[];
    if (!data || !Array.isArray(data) || data.length === 0) {
      return formatToolResult({ error: `No quote data for ${ticker}` }, []);
    }
    const q = data[0] as Record<string, unknown>;
    return formatToolResult({
      ticker,
      price: q['price'],
      change: q['change'],
      changePercent: q['changesPercentage'],
      volume: q['volume'],
      avgVolume: q['avgVolume'],
      marketCap: q['marketCap'],
      pe: q['pe'],
      eps: q['eps'],
      high52w: q['yearHigh'],
      low52w: q['yearLow'],
      previousClose: q['previousClose'],
      open: q['open'],
      sharesOutstanding: q['sharesOutstanding'],
      name: q['name'],
      exchange: q['exchange'],
    }, [`${BASE_URL}/quote/${ticker}`]);
  },
});

// ── 2. 公司概览（详细基本面）────────────────────────────────────
export const fmpGetProfile = new DynamicStructuredTool({
  name: 'fmp_get_profile',
  description: 'Get company profile: sector, industry, description, CEO, employees, dividend yield, beta, analyst target price.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const data = await fmpFetch(`/profile/${ticker}`) as unknown[];
    if (!data || !Array.isArray(data) || data.length === 0) {
      return formatToolResult({ error: `No profile data for ${ticker}` }, []);
    }
    const p = data[0] as Record<string, unknown>;
    return formatToolResult({
      ticker,
      name: p['companyName'],
      sector: p['sector'],
      industry: p['industry'],
      ceo: p['ceo'],
      employees: p['fullTimeEmployees'],
      description: p['description'],
      country: p['country'],
      exchange: p['exchangeShortName'],
      marketCap: p['mktCap'],
      price: p['price'],
      beta: p['beta'],
      dividendYield: p['lastDiv'],
      dcfPrice: p['dcf'],
      analystTargetPrice: p['dcf'],
      ipoDate: p['ipoDate'],
    }, [`${BASE_URL}/profile/${ticker}`]);
  },
});

// ── 3. 损益表（季度/年度）────────────────────────────────────────
export const fmpGetIncomeStatement = new DynamicStructuredTool({
  name: 'fmp_get_income_statement',
  description: 'Get income statement (revenue, gross profit, net income, EBITDA, EPS, operating income) quarterly or annual.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarter', 'annual']).default('quarter'),
    limit: z.number().default(5).describe('Number of periods to return'),
  }),
  func: async ({ ticker, period, limit }) => {
    const data = await fmpFetch(`/income-statement/${ticker}`, {
      period,
      limit: String(limit),
    }) as unknown[];
    if (!data || !Array.isArray(data) || data.length === 0) {
      return formatToolResult({ error: `No income statement data for ${ticker}` }, []);
    }
    return formatToolResult({ ticker, period, reports: data },
      [`${BASE_URL}/income-statement/${ticker}`]);
  },
});

// ── 4. 资产负债表 ────────────────────────────────────────────────
export const fmpGetBalanceSheet = new DynamicStructuredTool({
  name: 'fmp_get_balance_sheet',
  description: 'Get balance sheet (total assets, liabilities, equity, cash, debt) quarterly or annual.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarter', 'annual']).default('quarter'),
    limit: z.number().default(4).describe('Number of periods to return'),
  }),
  func: async ({ ticker, period, limit }) => {
    const data = await fmpFetch(`/balance-sheet-statement/${ticker}`, {
      period,
      limit: String(limit),
    }) as unknown[];
    if (!data || !Array.isArray(data) || data.length === 0) {
      return formatToolResult({ error: `No balance sheet data for ${ticker}` }, []);
    }
    return formatToolResult({ ticker, period, reports: data },
      [`${BASE_URL}/balance-sheet-statement/${ticker}`]);
  },
});

// ── 5. 现金流量表 ────────────────────────────────────────────────
export const fmpGetCashFlow = new DynamicStructuredTool({
  name: 'fmp_get_cash_flow',
  description: 'Get cash flow statement (operating, investing, financing cash flows, free cash flow, capex).',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarter', 'annual']).default('quarter'),
    limit: z.number().default(4).describe('Number of periods to return'),
  }),
  func: async ({ ticker, period, limit }) => {
    const data = await fmpFetch(`/cash-flow-statement/${ticker}`, {
      period,
      limit: String(limit),
    }) as unknown[];
    if (!data || !Array.isArray(data) || data.length === 0) {
      return formatToolResult({ error: `No cash flow data for ${ticker}` }, []);
    }
    return formatToolResult({ ticker, period, reports: data },
      [`${BASE_URL}/cash-flow-statement/${ticker}`]);
  },
});

// ── 6. 关键财务指标（PE、EV/EBITDA、ROE等）──────────────────────
export const fmpGetKeyMetrics = new DynamicStructuredTool({
  name: 'fmp_get_key_metrics',
  description: 'Get key financial metrics: PE ratio, EV/EBITDA, EV/Sales, P/B, P/FCF, ROE, ROA, debt/equity, current ratio.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarter', 'annual']).default('quarter'),
    limit: z.number().default(4).describe('Number of periods to return'),
  }),
  func: async ({ ticker, period, limit }) => {
    const data = await fmpFetch(`/key-metrics/${ticker}`, {
      period,
      limit: String(limit),
    }) as unknown[];
    if (!data || !Array.isArray(data) || data.length === 0) {
      return formatToolResult({ error: `No key metrics data for ${ticker}` }, []);
    }
    return formatToolResult({ ticker, period, metrics: data },
      [`${BASE_URL}/key-metrics/${ticker}`]);
  },
});

// ── 7. 分析师评级和目标价 ─────────────────────────────────────────
export const fmpGetAnalystRatings = new DynamicStructuredTool({
  name: 'fmp_get_analyst_ratings',
  description: 'Get analyst ratings, price targets, and consensus (buy/hold/sell counts).',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const [ratings, targets] = await Promise.all([
      fmpFetch(`/analyst-stock-recommendations/${ticker}`, { limit: '1' }),
      fmpFetch(`/price-target-consensus/${ticker}`),
    ]);
    return formatToolResult({ ticker, ratings, priceTargetConsensus: targets },
      [`${BASE_URL}/analyst-stock-recommendations/${ticker}`]);
  },
});

// ── 8. 盈利数据（EPS实际vs预期）─────────────────────────────────
export const fmpGetEarnings = new DynamicStructuredTool({
  name: 'fmp_get_earnings',
  description: 'Get earnings history: EPS actual vs estimated, revenue actual vs estimated, earnings surprise.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    limit: z.number().default(8).describe('Number of quarters to return'),
  }),
  func: async ({ ticker, limit }) => {
    const data = await fmpFetch(`/earnings-surprises/${ticker}`) as unknown[];
    if (!data || !Array.isArray(data)) {
      return formatToolResult({ error: `No earnings data for ${ticker}` }, []);
    }
    return formatToolResult({ ticker, earnings: data.slice(0, limit) },
      [`${BASE_URL}/earnings-surprises/${ticker}`]);
  },
});

// 导出所有 FMP 工具
export const FMP_TOOLS = [
  fmpGetQuote,
  fmpGetProfile,
  fmpGetIncomeStatement,
  fmpGetBalanceSheet,
  fmpGetCashFlow,
  fmpGetKeyMetrics,
  fmpGetAnalystRatings,
  fmpGetEarnings,
];