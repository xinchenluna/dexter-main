import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';
import { formatToolResult } from '../types.js';

function runPython(script: string): unknown {
  try {
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
      timeout: 15000,
      encoding: 'utf-8',
    });
    return JSON.parse(result.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[yfinance] Python error: ${msg}`);
  }
}

// ── 1. 实时股价快照 ──────────────────────────────────────────────
export const yfGetQuote = new DynamicStructuredTool({
  name: 'yf_get_quote',
  description: 'Get real-time stock quote: price, change%, volume, market cap, PE ratio, 52-week high/low, analyst target price.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol e.g. MU, AAPL'),
  }),
  func: async ({ ticker }) => {
    const script = `
import yfinance as yf, json, warnings
warnings.filterwarnings('ignore')
t = yf.Ticker('${ticker}')
i = t.info
print(json.dumps({
  'ticker': '${ticker}',
  'price': t.fast_info.get('lastPrice'),
  'previousClose': t.fast_info.get('previousClose'),
  'change': round((t.fast_info.get('lastPrice',0) - t.fast_info.get('previousClose',0)), 2),
  'changePercent': round(((t.fast_info.get('lastPrice',0) - t.fast_info.get('previousClose',0)) / max(t.fast_info.get('previousClose',1),1)) * 100, 2),
  'volume': t.fast_info.get('lastVolume'),
  'marketCap': t.fast_info.get('marketCap'),
  'week52High': t.fast_info.get('fiftyTwoWeekHigh'),
  'week52Low': t.fast_info.get('fiftyTwoWeekLow'),
  'pe': i.get('trailingPE'),
  'forwardPE': i.get('forwardPE'),
  'eps': i.get('trailingEps'),
  'dividendYield': i.get('dividendYield'),
  'analystTargetPrice': i.get('targetMeanPrice'),
  'beta': i.get('beta'),
  'name': i.get('shortName'),
  'sector': i.get('sector'),
  'industry': i.get('industry'),
}))
`.trim();
    const data = runPython(script);
    return formatToolResult(data, [`https://finance.yahoo.com/quote/${ticker}`]);
  },
});

// ── 2. 季度财务报表 ───────────────────────────────────────────────
export const yfGetFinancials = new DynamicStructuredTool({
  name: 'yf_get_financials',
  description: 'Get quarterly income statement: revenue, gross profit, net income, EBITDA, operating income, EPS.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const script = `
import yfinance as yf, json, warnings
warnings.filterwarnings('ignore')
t = yf.Ticker('${ticker}')
q = t.quarterly_financials
if q is None or q.empty:
    print(json.dumps({'error': 'No data'}))
else:
    result = {}
    for col in q.columns[:5]:
        period = str(col.date())
        result[period] = {}
        for row in q.index:
            val = q.loc[row, col]
            try:
                result[period][row] = float(val) if val == val else None
            except:
                result[period][row] = None
    print(json.dumps({'ticker': '${ticker}', 'quarterly_financials': result}))
`.trim();
    const data = runPython(script);
    return formatToolResult(data, [`https://finance.yahoo.com/quote/${ticker}/financials`]);
  },
});

// ── 3. 资产负债表 ─────────────────────────────────────────────────
export const yfGetBalanceSheet = new DynamicStructuredTool({
  name: 'yf_get_balance_sheet',
  description: 'Get quarterly balance sheet: total assets, liabilities, equity, cash, total debt.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const script = `
import yfinance as yf, json, warnings
warnings.filterwarnings('ignore')
t = yf.Ticker('${ticker}')
q = t.quarterly_balance_sheet
if q is None or q.empty:
    print(json.dumps({'error': 'No data'}))
else:
    result = {}
    for col in q.columns[:4]:
        period = str(col.date())
        result[period] = {}
        for row in q.index:
            val = q.loc[row, col]
            try:
                result[period][row] = float(val) if val == val else None
            except:
                result[period][row] = None
    print(json.dumps({'ticker': '${ticker}', 'quarterly_balance_sheet': result}))
`.trim();
    const data = runPython(script);
    return formatToolResult(data, [`https://finance.yahoo.com/quote/${ticker}/balance-sheet`]);
  },
});

// ── 4. 现金流量表 ─────────────────────────────────────────────────
export const yfGetCashFlow = new DynamicStructuredTool({
  name: 'yf_get_cash_flow',
  description: 'Get quarterly cash flow: operating cash flow, free cash flow, capital expenditure.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const script = `
import yfinance as yf, json, warnings
warnings.filterwarnings('ignore')
t = yf.Ticker('${ticker}')
q = t.quarterly_cashflow
if q is None or q.empty:
    print(json.dumps({'error': 'No data'}))
else:
    result = {}
    for col in q.columns[:4]:
        period = str(col.date())
        result[period] = {}
        for row in q.index:
            val = q.loc[row, col]
            try:
                result[period][row] = float(val) if val == val else None
            except:
                result[period][row] = None
    print(json.dumps({'ticker': '${ticker}', 'quarterly_cashflow': result}))
`.trim();
    const data = runPython(script);
    return formatToolResult(data, [`https://finance.yahoo.com/quote/${ticker}/cash-flow`]);
  },
});

// ── 5. 分析师评级和目标价 ─────────────────────────────────────────
export const yfGetAnalyst = new DynamicStructuredTool({
  name: 'yf_get_analyst',
  description: 'Get analyst recommendations, price targets, and earnings estimates.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const script = `
import yfinance as yf, json, warnings
warnings.filterwarnings('ignore')
t = yf.Ticker('${ticker}')
i = t.info
result = {
  'ticker': '${ticker}',
  'targetMeanPrice': i.get('targetMeanPrice'),
  'targetHighPrice': i.get('targetHighPrice'),
  'targetLowPrice': i.get('targetLowPrice'),
  'targetMedianPrice': i.get('targetMedianPrice'),
  'recommendationMean': i.get('recommendationMean'),
  'recommendationKey': i.get('recommendationKey'),
  'numberOfAnalystOpinions': i.get('numberOfAnalystOpinions'),
}
print(json.dumps(result))
`.trim();
    const data = runPython(script);
    return formatToolResult(data, [`https://finance.yahoo.com/quote/${ticker}/analysis`]);
  },
});

// ── 6. ETF 持仓构成 ───────────────────────────────────────────────
export const yfGetEtfHoldings = new DynamicStructuredTool({
  name: 'yf_get_etf_holdings',
  description: 'Get ETF top holdings, sector weights, and fund info. Use for VOO, QQQM, SCHD, BOTZ, IAU, SLV, URA, EWY etc.',
  schema: z.object({
    ticker: z.string().describe('ETF ticker symbol'),
  }),
  func: async ({ ticker }) => {
    const script = [
      'import yfinance as yf, json, warnings',
      'warnings.filterwarnings("ignore")',
      `t = yf.Ticker("${ticker}")`,
      'i = t.info',
      'holdings = []',
      'try:',
      '    h = t.funds_data.top_holdings',
      '    if h is not None and not h.empty:',
      '        holdings = h.reset_index().to_dict("records")[:15]',
      'except:',
      '    pass',
      'sector_weights = {}',
      'try:',
      '    sw = t.funds_data.sector_weightings',
      '    if sw is not None:',
      '        sector_weights = sw',
      'except:',
      '    pass',
      'result = {',
      '    "ticker": "' + ticker + '",',
      '    "name": i.get("shortName") or i.get("longName"),',
      '    "totalAssets": i.get("totalAssets"),',
      '    "expenseRatio": i.get("annualReportExpenseRatio") or i.get("expenseRatio"),',
      '    "yield": i.get("yield") or i.get("dividendYield"),',
      '    "ytdReturn": i.get("ytdReturn"),',
      '    "threeYearReturn": i.get("threeYearAverageReturn"),',
      '    "fiveYearReturn": i.get("fiveYearAverageReturn"),',
      '    "beta3Year": i.get("beta3Year"),',
      '    "top_holdings": holdings,',
      '    "sector_weights": sector_weights,',
      '}',
      'print(json.dumps(result, default=str))',
    ].join('\n');
    const data = runPython(script);
    return formatToolResult(data, [`https://finance.yahoo.com/quote/${ticker}/holdings`]);
  },
});

export const YFINANCE_TOOLS = [
  yfGetQuote,
  yfGetFinancials,
  yfGetBalanceSheet,
  yfGetCashFlow,
  yfGetAnalyst,
  yfGetEtfHoldings,
];