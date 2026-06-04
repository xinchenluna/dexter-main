import { describe, expect, test } from 'bun:test';
import { resolveMaxIterations, RUNTIME_PROFILES } from './runtime-profile.js';
import { Scratchpad, HARD_LIMIT_TOOLS } from './scratchpad.js';

describe('resolveMaxIterations', () => {
  test('explicit maxIterations wins', () => {
    expect(resolveMaxIterations({ maxIterations: 5, runtimeProfile: 'research' })).toBe(5);
  });

  test('profile default when maxIterations omitted', () => {
    expect(resolveMaxIterations({ runtimeProfile: 'messaging' })).toBe(
      RUNTIME_PROFILES.messaging.maxIterations,
    );
    expect(resolveMaxIterations({})).toBe(RUNTIME_PROFILES.research.maxIterations);
  });
});

describe('Scratchpad hard limits', () => {
  test('blocks meta-tools at maxCallsPerTool', () => {
    const pad = new Scratchpad('test query', { maxCallsPerTool: 2 });
    expect(HARD_LIMIT_TOOLS.has('get_financials')).toBe(true);

    pad.recordToolCall('get_financials', 'AAPL revenue');
    pad.recordToolCall('get_financials', 'MSFT revenue');

    const third = pad.canCallTool('get_financials', 'GOOG revenue');
    expect(third.allowed).toBe(false);
    expect(third.warning).toContain('limit');
  });

  test('soft-warns non-meta tools before hard cap pattern', () => {
    const pad = new Scratchpad('test', { maxCallsPerTool: 3 });
    pad.recordToolCall('web_search', 'news');
    pad.recordToolCall('web_search', 'more news');
    const check = pad.canCallTool('web_search', 'again');
    expect(check.allowed).toBe(true);
  });
});
