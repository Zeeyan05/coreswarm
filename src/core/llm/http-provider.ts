/**
 * CoreSwarm HTTP LLM Provider
 *
 * Talks to a real model (Anthropic or OpenAI) through the server-side
 * `/api/llm` route, so API keys never reach the browser. Falls back to
 * honest errors when no key is configured — never silent simulation.
 */

import type { LLMProvider } from './provider';

export interface HttpLLMConfig {
  /** Same-origin endpoint (default: /api/llm). */
  readonly endpoint?: string;
  /** Model override (server may enforce its own default). */
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export class HttpLLMProvider implements LLMProvider {
  readonly #endpoint: string;
  readonly #model?: string;
  readonly #temperature: number;
  readonly #maxTokens: number;

  constructor(config: HttpLLMConfig = {}) {
    this.#endpoint = config.endpoint ?? '/api/llm';
    this.#model = config.model;
    this.#temperature = config.temperature ?? 0.2;
    this.#maxTokens = config.maxTokens ?? 2000;
  }

  async generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const res = await fetch(this.#endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: this.#model,
        temperature: options?.temperature ?? this.#temperature,
        maxTokens: options?.maxTokens ?? this.#maxTokens,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { text?: string };
    if (typeof data.text !== 'string' || data.text.length === 0) {
      throw new Error('LLM returned an empty response');
    }
    return data.text;
  }

  async structuredGenerate<T>(prompt: string, schemaDescription: string, options?: { temperature?: number }): Promise<T> {
    const text = await this.generate(
      `${prompt}\n\nRespond with valid JSON only, matching this shape: ${schemaDescription}. No markdown fences, no commentary.`,
      { temperature: options?.temperature ?? 0, maxTokens: this.#maxTokens },
    );
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`LLM did not return valid JSON (first 200 chars): ${cleaned.slice(0, 200)}`);
    }
  }
}
