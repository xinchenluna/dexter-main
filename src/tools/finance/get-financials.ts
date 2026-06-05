import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { resolveRouterModel } from '../../providers.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { withTimeout, SUB_TOOL_TIMEOUT_MS } from './utils.js';
import { FINANCIAL_FORMATTERS } from './formatters.js';
import { buildMetricGuardrails } from './metric-guardrails.js';
import { YFINANCE_TOOLS } from './yfinance-tool.js';
import { FMP_TOOLS } from './fmp.js';
import { POLYGON_TOOLS } from './polygon.js';
import { secEdgarGetCompanyFacts } from './sec-edgar.js';


/**
 * Rich description for the get_financials tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const GET_FINANCIALS_DESCRIPTION = `
Intelligent meta-tool for retrieving company financial data. Takes a natural language query and automatically routes to appropriate financial data sources.

## When to Use

- Company facts (sector, industry, market cap, number of employees, listing date, exchange, location, weighted average shares, website)
- Company financials (income statements, balance sheets, cash flow statements)
- Financial metrics and key ratios (P/E ratio, market cap, EPS, dividend yield, enterprise value, ROE, ROA, margins)
- Historical metrics and trend analysis across multiple periods
- Financial segment breakdowns (revenue, margins, etc. by product / geography)
- Earnings data (EPS/revenue beat-miss, earnings surprises)
- Multi-company comparisons (pass the full query, it handles routing internally)

## When NOT to Use

- Stock or cryptocurrency prices (use get_market_data instead)
- Company news or insider trading activity (use get_market_data instead)
- General web searches or non-financial topics (use web_search instead)
- Questions that don't require external financial data (answer directly from knowledge)
- Non-public company information
- Real-time trading or order execution
- Reading SEC filing content (use read_filings instead)
- Stock screening by criteria (use stock_screener)

## Usage Notes

- Call ONCE with the complete natural language query - the tool handles complexity internally
- For comparisons like "compare AAPL vs MSFT revenue", pass the full query as-is
- Handles ticker resolution automatically (Apple -> AAPL, Microsoft -> MSFT)
- Handles date inference (e.g., "last quarter", "past 5 years", "YTD")
- Returns structured JSON data with source URLs for verification
`.trim();

/** Format snake_case tool name to Title Case for progress messages */
function formatSubToolName(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Import all finance tools directly (avoid circular deps with index.ts)

function buildFinanceTools(): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [...(YFINANCE_TOOLS)];
  if (process.env.FMP_API_KEY) {
    tools.push(...FMP_TOOLS);
  }
  if (process.env.POLYGON_API_KEY) {
    tools.push(...POLYGON_TOOLS);
  }
  tools.push(secEdgarGetCompanyFacts);
  return tools;
}

const FINANCE_TOOLS = buildFinanceTools();
const FINANCE_TOOL_MAP = new Map(FINANCE_TOOLS.map(t => [t.name, t]));

function buildRouterToolList(): string {
  return FINANCE_TOOLS.map((t) => `- ${t.name}`).join('\n');
}

function buildRouterPrompt(): string {
  const hasFmp = Boolean(process.env.FMP_API_KEY);
  const hasPolygon = Boolean(process.env.POLYGON_API_KEY);
  const sourceNote = hasFmp
    ? 'Use fmp_* for fundamentals and yf_* for quick quote/analyst snapshots.'
    : 'FMP is unavailable. Use yf_* for broad fundamentals and sec_edgar_get_company_facts for high-trust accounting tags.';
  const polygonNote = hasPolygon
    ? 'Use polygon_get_ticker_reference / polygon_get_financials for standardized reference/valuation fields. Keep Polygon calls minimal (rate limits).'
    : 'Polygon tools are unavailable unless POLYGON_API_KEY is configured.';

  return `You are a financial data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial data, call the appropriate tool(s) from this registry only:

${buildRouterToolList()}

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols (Apple → AAPL, Tesla → TSLA, etc.).

2. **Date Inference**: Use schema-supported filters for date ranges (last year, last quarter, past 5 years, YTD).

3. **Tool selection**: ${sourceNote}
   - Quotes / market snapshot → yf_get_quote or fmp_get_quote
   - Income / revenue → yf_get_financials or fmp_get_income_statement
   - Balance sheet → yf_get_balance_sheet or fmp_get_balance_sheet
   - Cash flow / FCF → yf_get_cash_flow or fmp_get_cash_flow
   - Standardized company reference / valuation fields → polygon_get_ticker_reference / polygon_get_financials
   - High-trust SEC accounting tags (e.g., SBC) → sec_edgar_get_company_facts
   - ${polygonNote}

4. **Efficiency**: Use the smallest limit that answers the question; for comparisons, call the same tool per ticker.

5. **Metric metadata guardrails**:
   - Every numeric claim in your final analysis must include source + period + unit metadata.
   - For flow metrics (revenue, net income, SBC, FCF): period is REQUIRED (e.g., FY2025, Q1 2026).
   - For stock/snapshot metrics (market cap, cash, debt, total assets/liabilities): period may be "latest" or "snapshot".
   - For ratio/multiple metrics: unit may be "x", "%", or "ratio" (period can be "latest"/"snapshot" when appropriate).
   - If metadata is missing, explicitly mark the metric as unavailable.

Call the appropriate tool(s) now.`;
}

// Input schema for the get_financials tool
const GetFinancialsInputSchema = z.object({
  query: z.string().describe('Natural language query about financial data'),
});

/**
 * Create a get_financials tool configured with the specified model.
 * Uses native LLM tool calling for routing queries to finance tools.
 */
export function createGetFinancials(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_financials',
    description: `Intelligent meta-tool for retrieving company financial data. Takes a natural language query and automatically routes to appropriate financial data tools. Use for:
- Company financials (income statements, balance sheets, cash flow)
- Financial metrics and key ratios (P/E ratio, market cap, EPS, dividend yield, ROE, margins)
- Historical metrics and trend analysis
- Earnings data and financial segments`,
    schema: GetFinancialsInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

      // 1. Call LLM with finance tools bound (native tool calling)
      onProgress?.('Fetching...');
      const { response } = await callLlm(input.query, {
        model: resolveRouterModel(model),
        systemPrompt: buildRouterPrompt(),
        tools: FINANCE_TOOLS,
      });
      const aiMessage = response as AIMessage;
      // 2. Check for tool calls
      const toolCalls = aiMessage.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({
          error: 'No tools selected for query',
          hint: 'No compatible finance source/tool available for this query. Add FMP/Financial Datasets credentials or narrow the request.',
        }, []);
      }

      // 3. Execute tool calls in parallel
      const toolNames = [...new Set(toolCalls.map(tc => formatSubToolName(tc.name)))];
      onProgress?.(`Fetching from ${toolNames.join(', ')}...`);
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = FINANCE_TOOL_MAP.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await withTimeout(tool.invoke(tc.args), SUB_TOOL_TIMEOUT_MS, tc.name);
            const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 4. Combine results
      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);

      // Collect all source URLs
      const allUrls = results.flatMap((r) => r.sourceUrls);

      // Build combined data structure
      const combinedData: Record<string, unknown> = {};
      const metricGuardrails: Record<string, unknown> = {};

      for (const result of successfulResults) {
        const ticker = (result.args as Record<string, unknown>).ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        const formatter = FINANCIAL_FORMATTERS[result.tool];
        combinedData[key] = formatter
          ? formatter(result.data, result.args as Record<string, unknown>)
          : result.data;

        if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
          const rows = buildMetricGuardrails({
            tool: result.tool,
            ticker,
            sourceUrl: result.sourceUrls[0],
            metrics: result.data as Record<string, unknown>,
            period: (result.args as Record<string, unknown>).period as string | undefined,
          });
          if (rows.length > 0) {
            metricGuardrails[key] = rows;
          }
        }
      }

      // Add errors if any
      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }
      if (Object.keys(metricGuardrails).length > 0) {
        combinedData._metricGuardrails = metricGuardrails;
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
