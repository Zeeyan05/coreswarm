import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side LLM gateway. API keys never reach the browser.
 *
 * Providers (chosen by LLM_PROVIDER env):
 * - anthropic  (ANTHROPIC_API_KEY) — paid, default
 * - openai     (OPENAI_API_KEY) — paid
 * - gemini     (GEMINI_API_KEY) — FREE tier, generous, no card: https://aistudio.google.com/apikey
 * - groq       (GROQ_API_KEY) — FREE tier, very fast: https://console.groq.com/keys
 * - openrouter (OPENROUTER_API_KEY) — free models available: https://openrouter.ai/keys
 *
 * Optional: LLM_MODEL overrides the default model per provider.
 * POST { prompt, model?, temperature?, maxTokens? } → { text, provider, model }
 */

const MAX_PROMPT_CHARS = 24_000;
const DEFAULT_MAX_TOKENS = 2000;

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
};

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Shared OpenAI-compatible chat-completions call (openai / groq / openrouter). */
async function chatCompletions(
  url: string,
  key: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, text: '' };
  const data = (await res.json()) as ChatCompletionsResponse;
  return { ok: true, status: 200, text: data.choices?.[0]?.message?.content ?? '' };
}

export async function POST(request: NextRequest) {
  let body: { prompt?: unknown; model?: unknown; temperature?: unknown; maxTokens?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return NextResponse.json({ error: 'Missing `prompt` string' }, { status: 400 });
  }
  if (body.prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `Prompt exceeds ${MAX_PROMPT_CHARS} chars` }, { status: 413 });
  }

  const temperature = typeof body.temperature === 'number'
    ? Math.min(1, Math.max(0, body.temperature))
    : 0.2;
  const maxTokens = typeof body.maxTokens === 'number'
    ? Math.min(8000, Math.max(64, Math.floor(body.maxTokens)))
    : DEFAULT_MAX_TOKENS;

  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const modelOverride = typeof body.model === 'string' && body.model.length > 0 ? body.model : undefined;
  const model = modelOverride ?? process.env.LLM_MODEL ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic!;
  const prompt = body.prompt;

  try {
    // ---- OpenAI-compatible providers ----
    if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
      const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY';
      const key = process.env[envKey];
      if (!key) {
        return NextResponse.json({ error: `LLM not configured (${envKey} missing)` }, { status: 503 });
      }
      const url = provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';
      const extra: Record<string, string> = provider === 'openrouter'
        ? { 'HTTP-Referer': 'https://coreswarm.vercel.app', 'X-Title': 'CoreSwarm' }
        : {};
      const r = await chatCompletions(url, key, model, prompt, temperature, maxTokens, extra);
      if (!r.ok) return NextResponse.json({ error: `${provider} error (${r.status})` }, { status: 502 });
      if (!r.text) return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
      return NextResponse.json({ text: r.text, provider, model });
    }

    // ---- Gemini (free tier) ----
    if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return NextResponse.json({ error: 'LLM not configured (GEMINI_API_KEY missing)' }, { status: 503 });
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens },
          }),
        },
      );
      if (!res.ok) return NextResponse.json({ error: `Gemini error (${res.status})` }, { status: 502 });
      const data = (await res.json()) as GeminiResponse;
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('');
      if (!text) return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
      return NextResponse.json({ text, provider: 'gemini', model });
    }

    // ---- Anthropic (default) ----
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ error: 'LLM not configured (ANTHROPIC_API_KEY missing)' }, { status: 503 });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Anthropic error (${res.status})` }, { status: 502 });
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
    if (!text) return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
    return NextResponse.json({ text, provider: 'anthropic', model });
  } catch (err) {
    return NextResponse.json(
      { error: `LLM gateway failure: ${(err as Error)?.message ?? String(err)}` },
      { status: 502 },
    );
  }
}

const PROVIDER_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export async function GET() {
  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const keyName = PROVIDER_KEYS[provider] ?? 'ANTHROPIC_API_KEY';
  return NextResponse.json({
    provider,
    configured: Boolean(process.env[keyName]),
    model: process.env.LLM_MODEL ?? DEFAULT_MODELS[provider] ?? null,
    freeOptions: ['gemini', 'groq', 'openrouter'],
  });
}
