import { callLlm } from '../model/llm.js';
import { extractTextContent } from '../utils/ai-message.js';
import type { AIMessage } from '@langchain/core/messages';

const PARTIAL_ANSWER_PROMPT = `You hit the iteration limit while researching. Using only the tool results below, answer the user's query as completely as possible.

- Lead with the main finding; include specific numbers and dates from the results.
- Explicitly list any data gaps or unanswered parts of the query.
- Do not call tools or ask the user to wait for more research.`;

/**
 * Produce a best-effort answer when the agent loop exhausts maxIterations.
 */
export async function synthesizePartialAnswer(params: {
  model: string;
  systemPrompt: string;
  query: string;
  toolResults: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!params.toolResults.trim()) {
    return '';
  }

  const prompt = `${PARTIAL_ANSWER_PROMPT}

User query:
${params.query}

Tool results:
${params.toolResults}`;

  const { response } = await callLlm(prompt, {
    model: params.model,
    systemPrompt: params.systemPrompt,
    signal: params.signal,
  });

  const text =
    typeof response === 'string'
      ? response.trim()
      : extractTextContent(response as AIMessage)?.trim() ?? '';

  return text;
}
