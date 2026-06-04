import { afterEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_ROUTER_MODEL,
  getFastModel,
  resolveRouterModel,
} from '../providers.js';

const ORIGINAL_ROUTER_MODEL = process.env.ROUTER_MODEL;
const ORIGINAL_CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
const ORIGINAL_GROQ_KEY = process.env.GROQ_API_KEY;

afterEach(() => {
  if (ORIGINAL_ROUTER_MODEL === undefined) {
    delete process.env.ROUTER_MODEL;
  } else {
    process.env.ROUTER_MODEL = ORIGINAL_ROUTER_MODEL;
  }
  if (ORIGINAL_CEREBRAS_KEY === undefined) {
    delete process.env.CEREBRAS_API_KEY;
  } else {
    process.env.CEREBRAS_API_KEY = ORIGINAL_CEREBRAS_KEY;
  }
  if (ORIGINAL_GROQ_KEY === undefined) {
    delete process.env.GROQ_API_KEY;
  } else {
    process.env.GROQ_API_KEY = ORIGINAL_GROQ_KEY;
  }
});

describe('resolveRouterModel', () => {
  test('ROUTER_MODEL env overrides everything', () => {
    process.env.ROUTER_MODEL = 'groq:llama-3.3-70b-versatile';
    process.env.CEREBRAS_API_KEY = 'test-key';
    expect(resolveRouterModel('deepseek-v4-pro')).toBe('groq:llama-3.3-70b-versatile');
  });

  test('uses Cerebras default router when CEREBRAS_API_KEY is set', () => {
    delete process.env.ROUTER_MODEL;
    process.env.CEREBRAS_API_KEY = 'test-key';
    delete process.env.GROQ_API_KEY;
    expect(resolveRouterModel('deepseek-v4-pro')).toBe(DEFAULT_ROUTER_MODEL);
  });

  test('falls back to agent fast model when no router keys', () => {
    delete process.env.ROUTER_MODEL;
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.GROQ_API_KEY;
    expect(resolveRouterModel('deepseek-v4-pro')).toBe('deepseek-v4-flash');
    expect(resolveRouterModel('ollama:llama3.1')).toBe('ollama:llama3.1');
  });

  test('getFastModel matches deepseek fast variant', () => {
    expect(getFastModel('deepseek', 'deepseek-v4-pro')).toBe('deepseek-v4-flash');
  });
});
