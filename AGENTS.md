# Repository Guidelines

- Repo: https://github.com/virattt/dexter
- Dexter is a CLI-based AI agent for deep financial research, built with TypeScript, pi-tui, and LangChain.

## Project Structure

- Source code: `src/`
  - Agent core: `src/agent/` (agent loop, prompts, scratchpad, compaction, runtime profiles)
  - CLI: `src/cli.ts` (pi-tui), entry point: `src/index.tsx`
  - Controllers: `src/controllers/` (agent runner, model selection, input history)
  - Components: `src/components/` (pi-tui UI components)
  - Model/LLM: `src/model/llm.ts` (multi-provider LLM abstraction; default DeepSeek)
  - Gateway: `src/gateway/` (WhatsApp and channel routing)
  - Tools: `src/tools/` (finance meta-tools, web search, browser, memory, skills)
  - Finance tools: `src/tools/finance/` (`get_financials`, `get_market_data`, filings, screener)
  - Search tools: `src/tools/search/` (Exa, Perplexity, Tavily, LangSearch — env-dependent)
  - Browser: `src/tools/browser/` (Playwright-based web scraping)
  - Skills: `src/skills/` (SKILL.md playbooks, e.g. DCF valuation)
  - Memory: `src/memory/` (SQLite + hybrid search over `.dexter/memory/`)
  - Utils: `src/utils/` (env, config, caching, token estimation)
  - Evals: `src/evals/` (LangSmith evaluation runner)
- Config: `.dexter/settings.json` (persisted model/provider selection)
- Environment: `.env` (API keys)
- Scripts: `scripts/release.sh`

## Build, Test, and Development Commands

- Runtime: Bun (primary). Use `bun` for all commands.
- Install deps: `bun install`
- Run: `bun run start` or `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Gateway: `bun run gateway`
- Type-check: `bun run typecheck`
- Tests: `bun test`
- Evals: `bun run src/evals/run.ts` (full) or `bun run src/evals/run.ts --sample 10` (sampled)
- CI runs `bun run typecheck` and `bun test` on push/PR.

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode).
- Prefer strict typing; avoid `any`.
- Keep files concise; extract helpers rather than duplicating code.
- Add brief comments for tricky or non-obvious logic.
- Do not add logging unless explicitly asked.
- Do not create README or documentation files unless explicitly asked.

## LLM Providers

- Supported: OpenAI, Anthropic, Google, xAI (Grok), OpenRouter, Ollama (local), DeepSeek.
- Defaults: `DEFAULT_PROVIDER=deepseek`, `DEFAULT_MODEL=deepseek-chat` in `src/model/llm.ts`.
- Provider detection is prefix- and settings-based; see `src/providers.ts`.
- Fast models for compaction/memory flush: provider `fastModel` in `src/providers.ts`.
- Users switch providers/models via `/model` in the CLI.

## Tools

Registered in `src/tools/registry.ts` (conditionally based on env vars):

- `get_financials`: financial statements, metrics, segments (internal LLM router → yfinance / fundamentals / optional FMP)
- `get_market_data`: prices, news, insider trades (internal router)
- `read_filings`: SEC 10-K, 10-Q, 8-K sections
- `stock_screener`: screen by financial criteria
- `web_search`: web search (provider fallback chain)
- `web_fetch` / `browser`: page content
- `read_file` / `write_file` / `edit_file`: local files (`write_file` / `edit_file` require approval)
- `memory_search` / `memory_get` / `memory_update`: persistent memory (use `memory_update` for memory files, not `write_file`)
- `skill`: loads SKILL.md playbook instructions (deduped once per query)
- `heartbeat` / `cron`: scheduled maintenance

Meta-tools `get_financials` and `get_market_data` have a hard per-query call cap (see `Scratchpad`).

## Skills (Playbooks)

- Skills live as `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown body.
- Built-in example: `src/skills/dcf/SKILL.md` (`name: dcf-valuation`).
- Discovery: `src/skills/registry.ts`.
- The `skill` tool returns instructions for the main agent to follow; it does not run a separate agent.

## Agent Architecture

- Agent loop: `src/agent/agent.ts`. ReAct loop with tool calling; final answer is the last assistant message when no tools are called (no separate synthesis pass unless max iterations).
- **LLM context SSOT**: LangChain `messages[]` (`SystemMessage`, history, `HumanMessage`, `AIMessage`, `ToolMessage`).
- **Scratchpad** (`src/agent/scratchpad.ts`): append-only JSONL audit log, compaction input, tool-call limits, and `DoneEvent` metadata — not what the model reads each turn (tool results are in `ToolMessage`s).
- Context management: `microcompact` (trim old tool messages) → memory flush → LLM `compactContext` → truncate fallback; see `src/agent/microcompact.ts`, `compact.ts`.
- Runtime profiles: `src/agent/runtime-profile.ts` — `research` (20 iter, CLI), `messaging` (10, gateway), `maintenance` (6, cron/heartbeat).
- Events: `tool_start`, `tool_end`, `tool_progress`, `thinking`, `stream_progress`, `compaction`, `microcompact`, `done`, etc.

## Environment Variables

- LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`
- Ollama: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- Finance: `FINANCIAL_DATASETS_API_KEY`, `FMP_API_KEY` (optional, enables FMP sub-tools in routers)
- Search: `EXASEARCH_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `LANGSEARCH_API_KEY`
- X: `X_BEARER_TOKEN`
- Tracing: `LANGSMITH_*`
- Never commit `.env` files or real API keys.

## Version & Release

- Version format: CalVer `YYYY.M.D` (no zero-padding). Tag prefix: `v`.
- Release script: `bash scripts/release.sh [version]`
- Do not push or publish without user confirmation.

## Testing

- Framework: Bun's built-in test runner (primary).
- Tests colocated as `*.test.ts`.
- Run `bun test` before pushing when you touch logic.

## Security

- API keys in `.env` (gitignored) or interactive CLI setup.
- Config in `.dexter/settings.json` (gitignored).
- Never commit or expose real API keys, tokens, or credentials.
