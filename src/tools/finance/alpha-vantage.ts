import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

const BASE_URL = 'https://www.alphavantage.co/query';

function getApiKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error('[Alpha Vantage] ALPHA_VANTAGE_API_KEY not set');
  return key;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function avFetch(params: Record<string, string>): Promise<Record<string, unknown>> {
  await sleep(200); // 每次调用间隔200ms，确保不超过每分钟5次
  const url = new URL(BASE_URL);
  url.searchParams.set('apikey', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`[Alpha Vantage] HTTP ${res.status}`);
  const data = await res.json();
  if (data['Note'] || data['Information']) {
    throw new Error(`[Alpha Vantage] Rate limit: ${data['Note'] ?? data['Information']}`);
  }
  return data as Record<string, unknown>;
}

// ── 1. 实时股价快照 ──────────────────────────────────────────────
export const avGetQuote = new DynamicStructuredTool({
  name: 'av_get_quote',
  description: 'Get real-time stock quote (price, change, volume, 52-week high/low) from Alpha Vantage.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  }),
  func: async ({ ticker }) => {
    const data = await avFetch({ function: 'GLOBAL_QUOTE', symbol: ticker });
    const q = data['Global Quote'] as Record<string, string> | undefined;
    if (!q || !q['05. price']) {
      return formatToolResult({ error: `No quote data for ${ticker}` }, []);
    }
    return formatToolResult({
      ticker,
      price: parseFloat(q['05. price']),
      change: parseFloat(q['09. change']),
      changePercent: q['10. change percent'],
      volume: parseInt(q['06. volume']),
      high52w: parseFloat(q['03. high']),
      low52w: parseFloat(q['04. low']),
      previousClose: parseFloat(q['08. previous close']),
      latestTradingDay: q['07. latest trading day'],
    }, [`${BASE_URL}?function=GLOBAL_QUOTE&symbol=${ticker}`]);
  },
});

// ── 2. 公司概览（PE、市值、EPS、股息率等）────────────────────────
export const avGetOverview = new DynamicStructuredTool({
  name: 'av_get_overview',
  description: 'Get company overview: market cap, PE ratio, EPS, dividend yield, 52-week range, analyst target price, sector, industry.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const data = await avFetch({ function: 'OVERVIEW', symbol: ticker });
    if (!data['Symbol']) {
      return formatToolResult({ error: `No overview data for ${ticker}` }, []);
    }
    return formatToolResult({
      ticker,
      name: data['Name'],
      sector: data['Sector'],
      industry: data['Industry'],
      marketCap: data['MarketCapitalization'],
      peRatio: data['PERatio'],
      forwardPE: data['ForwardPE'],
      pegRatio: data['PEGRatio'],
      eps: data['EPS'],
      dividendYield: data['DividendYield'],
      profitMargin: data['ProfitMargin'],
      operatingMargin: data['OperatingMarginTTM'],
      returnOnEquity: data['ReturnOnEquityTTM'],
      revenuePerShare: data['RevenuePerShareTTM'],
      analystTargetPrice: data['AnalystTargetPrice'],
      week52High: data['52WeekHigh'],
      week52Low: data['52WeekLow'],
      beta: data['Beta'],
      sharesOutstanding: data['SharesOutstanding'],
      description: data['Description'],
    }, [`${BASE_URL}?function=OVERVIEW&symbol=${ticker}`]);
  },
});

// ── 3. 季度收益（EPS 实际 vs 预期）──────────────────────────────
export const avGetEarnings = new DynamicStructuredTool({
  name: 'av_get_earnings',
  description: 'Get quarterly EPS actuals vs estimates and annual earnings history from Alpha Vantage.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const data = await avFetch({ function: 'EARNINGS', symbol: ticker });
    const quarterly = (data['quarterlyEarnings'] as unknown[] | undefined)?.slice(0, 6) ?? [];
    const annual = (data['annualEarnings'] as unknown[] | undefined)?.slice(0, 4) ?? [];
    return formatToolResult({ ticker, quarterlyEarnings: quarterly, annualEarnings: annual },
      [`${BASE_URL}?function=EARNINGS&symbol=${ticker}`]);
  },
});

// ── 4. 损益表（季度/年度）────────────────────────────────────────
export const avGetIncomeStatement = new DynamicStructuredTool({
  name: 'av_get_income_statement',
  description: 'Get income statement (revenue, gross profit, net income, EBITDA, EPS) quarterly or annual.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarterly', 'annual']).default('quarterly'),
  }),
  func: async ({ ticker, period }) => {
    const data = await avFetch({ function: 'INCOME_STATEMENT', symbol: ticker });
    const reports = period === 'quarterly'
      ? (data['quarterlyReports'] as unknown[] | undefined)?.slice(0, 5)
      : (data['annualReports'] as unknown[] | undefined)?.slice(0, 4);
    return formatToolResult({ ticker, period, reports },
      [`${BASE_URL}?function=INCOME_STATEMENT&symbol=${ticker}`]);
  },
});

// ── 5. 资产负债表 ────────────────────────────────────────────────
export const avGetBalanceSheet = new DynamicStructuredTool({
  name: 'av_get_balance_sheet',
  description: 'Get balance sheet (total assets, liabilities, equity, cash) quarterly or annual.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarterly', 'annual']).default('quarterly'),
  }),
  func: async ({ ticker, period }) => {
    const data = await avFetch({ function: 'BALANCE_SHEET', symbol: ticker });
    const reports = period === 'quarterly'
      ? (data['quarterlyReports'] as unknown[] | undefined)?.slice(0, 4)
      : (data['annualReports'] as unknown[] | undefined)?.slice(0, 3);
    return formatToolResult({ ticker, period, reports },
      [`${BASE_URL}?function=BALANCE_SHEET&symbol=${ticker}`]);
  },
});

// ── 6. 现金流量表 ────────────────────────────────────────────────
export const avGetCashFlow = new DynamicStructuredTool({
  name: 'av_get_cash_flow',
  description: 'Get cash flow statement (operating, investing, financing cash flows, free cash flow).',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    period: z.enum(['quarterly', 'annual']).default('quarterly'),
  }),
  func: async ({ ticker, period }) => {
    const data = await avFetch({ function: 'CASH_FLOW', symbol: ticker });
    const reports = period === 'quarterly'
      ? (data['quarterlyReports'] as unknown[] | undefined)?.slice(0, 4)
      : (data['annualReports'] as unknown[] | undefined)?.slice(0, 3);
    return formatToolResult({ ticker, period, reports },
      [`${BASE_URL}?function=CASH_FLOW&symbol=${ticker}`]);
  },
});

// 导出所有 AV 工具
export const ALPHA_VANTAGE_TOOLS = [
  avGetQuote,
  avGetOverview,
  avGetEarnings,
  avGetIncomeStatement,
  avGetBalanceSheet,
  avGetCashFlow,
];