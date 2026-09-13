import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side LLM gateway. API keys never reach the browser.
 * Supports Anthropic (ANTHROPIC_API_KEY) and OpenAI (OPENAI_API_KEY).
 * Provider/model chosen by env: LLM_PROVIDER=anthropic|openai, LLM_MODEL=...
 *
 * POST { prompt, model?, temperature?, maxTokens? } → { text, provider, model }
 */

const MAX_PROMPT_CHARS = 24_000;
const DEFAULT_MAX_TOKENS = 2000;

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
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

  try {
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return NextResponse.json({ error: 'LLM not configured (OPENAI_API_KEY missing)' }, { status: 503 });
      const model = typeof body.model === 'string' && body.model.length > 0
        ? body.model
        : (process.env.LLM_MODEL ?? 'gpt-4o-mini');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: body.prompt }],
        }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `OpenAI error (${res.status})` }, { status: 502 });
      }
      const data = (await res.json()) as OpenAIResponse;
      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text) return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
      return NextResponse.json({ text, provider: 'openai', model });
    }

    // Default: Anthropic
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ error: 'LLM not configured (ANTHROPIC_API_KEY missing)' }, { status: 503 });
    const model = typeof body.model === 'string' && body.model.length > 0
      ? body.model
      : (process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001');
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
        messages: [{ role: 'user', content: body.prompt }],
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

export async function GET() {
  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const configured = provider === 'openai' ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
  return NextResponse.json({ provider, configured, model: process.env.LLM_MODEL ?? null });
}
