import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side LLM gateway. API keys never reach the browser.
 *
 * Providers (LLM_PROVIDER):
 * - anthropic  (ANTHROPIC_API_KEY) — paid, high limits
 * - openai     (OPENAI_API_KEY) — paid, high limits
 * - gemini     (GEMINI_API_KEY) — FREE, generous: https://aistudio.google.com/apikey
 * - groq       (GROQ_API_KEY) — FREE, very fast: https://console.groq.com/keys
 * - openrouter (OPENROUTER_API_KEY) — multi-model gateway, free models: https://openrouter.ai/keys
 * - kintio     (KINTIO_API_KEY) — multi-model gateway, 44 models, 2 FREE
 *            (kintio-auto, claude-opus-4): https://api.kintio.com
 * - custom     (LLM_API_KEY + LLM_BASE_URL) — ANY OpenAI-compatible multi-model
 *            gateway (OpenRouter, Together, Fireworks, LiteLLM, Ollama tunnel...).
 *            Set LLM_BASE_URL=https://openrouter.ai/api/v1 and paste your key.
 *
 * Exhaustion protection (built-in):
 * - Model fallback chain: LLM_FALLBACK_MODELS="model-a,model-b" — on 429/quota
 *   the gateway tries the next model automatically instead of failing.
 * - Provider alternates: LLM_FALLBACK_PROVIDERS="gemini,groq" — when the whole
 *   primary provider is down, rate-limited, or unconfigured, the gateway fails
 *   over to the next provider that has a key. Per-provider model override:
 *   LLM_MODEL_GEMINI, LLM_MODEL_GROQ, ... (else each provider's default).
 * - Sensible free defaults picked for HIGH rate limits (8b instant > 70b).
 * - 60s response cache for identical prompts (decomposer/verifier repeat work).
 * - Caps: max 8000 tokens, prompt max 24k chars, temperature clamped 0..1.
 *
 * POST { prompt, model?, temperature?, maxTokens? } → { text, provider, model }
 */

const MAX_PROMPT_CHARS = 24_000;
const DEFAULT_MAX_TOKENS = 2000;
const CACHE_TTL_MS = 60_000;

// Primary defaults chosen for EXHAUSTION RESISTANCE (high free-tier limits),
// not raw capability. Override with LLM_MODEL if you need bigger models.
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.5-flash-lite',
  groq: 'llama-3.1-8b-instant',
  openrouter: 'google/gemini-2.0-flash-exp:free',
  kintio: 'kintio-auto',
  custom: process.env.LLM_MODEL ?? 'auto',
};

// Fallback chains tried in order on 429 / quota / overload. Cheap + high-limit first.
const DEFAULT_FALLBACKS: Record<string, string[]> = {
  groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'],
  openrouter: [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
  ],
  // Free-first: kintio-auto → claude-opus-4 (both free), then paid opt-ins.
  kintio: ['kintio-auto', 'claude-opus-4'],
  anthropic: [],
  openai: [],
  custom: [],
};

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

// Tiny in-memory cache: identical prompt+model within 60s returns cached text.
// This alone prevents most exhaustion (missions repeat verifier prompts).
const cache = new Map<string, { text: string; expires: number }>();

function cacheKey(provider: string, model: string, prompt: string): string {
  let h = 0;
  const s = `${provider}|${model}|${prompt}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `${h}:${s.length}`;
}

function cacheGet(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.text;
}

function cacheSet(key: string, text: string): void {
  if (cache.size > 500) cache.clear();
  cache.set(key, { text, expires: Date.now() + CACHE_TTL_MS });
}

/** Shared OpenAI-compatible chat-completions call. Returns status for fallback logic. */
async function chatCompletions(
  url: string,
  key: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; text: string; retryable: boolean }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    return { ok: false, status: 502, text: '', retryable: true };
  }
  if (!res.ok) {
    // 429 rate-limit, 502/503 overload → try next model. 401/403/404 → don't bother.
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 529;
    return { ok: false, status: res.status, text: '', retryable };
  }
  let data: ChatCompletionsResponse;
  try {
    data = (await res.json()) as ChatCompletionsResponse;
  } catch {
    return { ok: false, status: 502, text: '', retryable: true };
  }
  const text = data.choices?.[0]?.message?.content ?? '';
  return { ok: true, status: 200, text, retryable: false };
}

async function callGemini(
  key: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number,
): Promise<{ ok: boolean; status: number; text: string; retryable: boolean }> {
  let res: Response;
  try {
    res = await fetch(
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
  } catch {
    return { ok: false, status: 502, text: '', retryable: true };
  }
  if (!res.ok) {
    const retryable = res.status === 429 || res.status === 502 || res.status === 503;
    // Surface Google's message (invalid key vs disabled API vs unknown model).
    let detail = '';
    try {
      const errBody = (await res.json()) as { error?: { message?: string; status?: string } };
      if (errBody?.error?.message) detail = `: ${errBody.error.message.slice(0, 200)}`;
    } catch {
      // non-JSON error — keep status only
    }
    return { ok: false, status: res.status, text: '', retryable, detail } as { ok: boolean; status: number; text: string; retryable: boolean; detail?: string };
  }
  const data = (await res.json()) as GeminiResponse;
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return { ok: true, status: 200, text, retryable: false };
}

async function callAnthropic(
  key: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number,
): Promise<{ ok: boolean; status: number; text: string; retryable: boolean }> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
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
  } catch {
    return { ok: false, status: 502, text: '', retryable: true };
  }
  if (!res.ok) {
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 529;
    return { ok: false, status: res.status, text: '', retryable };
  }
  const data = (await res.json()) as AnthropicResponse;
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  return { ok: true, status: 200, text, retryable: false };
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

  const primaryProvider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const prompt = body.prompt;
  const requestedModel = typeof body.model === 'string' && body.model.length > 0 ? body.model : undefined;

  // Provider chain: primary + alternates (deduped). Alternates only engage
  // when the primary's whole chain is exhausted or its key is missing.
  const alternateProviders = (process.env.LLM_FALLBACK_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((p) => p && p !== primaryProvider && PROVIDER_KEYS[p]);
  const providerChain = [primaryProvider, ...alternateProviders];

  // Cache check on primary (fallbacks bypass cache to stay fresh).
  const primaryModel = requestedModel ?? process.env.LLM_MODEL ?? DEFAULT_MODELS[primaryProvider] ?? DEFAULT_MODELS.anthropic!;
  const key = cacheKey(primaryProvider, primaryModel, prompt);
  const cached = cacheGet(key);
  if (cached && !requestedModel) {
    return NextResponse.json({ text: cached, provider: primaryProvider, model: primaryModel, cached: true });
  }

  let lastStatus = 503;
  let lastError = 'LLM not configured';
  const tried: string[] = [];

  for (const provider of providerChain) {
    // Per-provider model: requested (primary only) → LLM_MODEL_<PROVIDER> →
    // LLM_MODEL (primary only) → provider default.
    const envModelVar = `LLM_MODEL_${provider.toUpperCase()}`;
    const first = provider === primaryProvider
      ? (requestedModel ?? process.env[envModelVar] ?? process.env.LLM_MODEL ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic!)
      : (process.env[envModelVar] ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic!);
    const envFallbacks = provider === primaryProvider
      ? (process.env.LLM_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const chain = [first, ...envFallbacks, ...(DEFAULT_FALLBACKS[provider] ?? [])].filter(
      (m, i, arr) => m && arr.indexOf(m) === i,
    );

    let providerExhausted = false;

    for (const model of chain) {
      tried.push(`${provider}/${model}`);
      let r: { ok: boolean; status: number; text: string; retryable: boolean };

      if (provider === 'gemini') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) { lastError = 'GEMINI_API_KEY missing'; providerExhausted = true; break; }
        r = await callGemini(apiKey, model, prompt, temperature, maxTokens);
      } else if (provider === 'anthropic') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) { lastError = 'ANTHROPIC_API_KEY missing'; providerExhausted = true; break; }
        r = await callAnthropic(apiKey, model, prompt, temperature, maxTokens);
      } else {
        // openai / groq / openrouter / kintio / custom — all OpenAI-compatible.
        const keyName = provider === 'openai' ? 'OPENAI_API_KEY'
          : provider === 'groq' ? 'GROQ_API_KEY'
          : provider === 'openrouter' ? 'OPENROUTER_API_KEY'
          : provider === 'kintio' ? 'KINTIO_API_KEY' : 'LLM_API_KEY';
        const apiKey = process.env[keyName];
        if (!apiKey) { lastError = `${keyName} missing`; providerExhausted = true; break; }
        const base = provider === 'openai' ? 'https://api.openai.com/v1'
          : provider === 'groq' ? 'https://api.groq.com/openai/v1'
          : provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
          : provider === 'kintio' ? 'https://api.kintio.com/v1'
          : (process.env.LLM_BASE_URL ?? '').replace(/\/$/, '');
        if (!base) { lastError = 'LLM_BASE_URL missing for custom provider'; providerExhausted = true; break; }
        const extra: Record<string, string> = provider === 'openrouter' || provider === 'custom' || provider === 'kintio'
          ? { 'HTTP-Referer': 'https://coreswarm.vercel.app', 'X-Title': 'CoreSwarm' }
          : {};
        r = await chatCompletions(`${base}/chat/completions`, apiKey, model, prompt, temperature, maxTokens, extra);
      }

      if (r.ok && r.text) {
        if (provider === primaryProvider && model === primaryModel) cacheSet(key, r.text);
        return NextResponse.json({
          text: r.text,
          provider,
          model,
          failover: provider !== primaryProvider ? { from: primaryProvider, tried } : undefined,
        });
      }
      lastStatus = r.status;
      const detail = (r as { detail?: string }).detail ?? '';
      lastError = `${provider}/${model} → HTTP ${r.status}${detail}`;
      if (!r.retryable) { providerExhausted = true; break; } // auth/model errors — next provider
      // else: 429/overload → try next model, then next provider
      providerExhausted = true;
    }

    // Fall through to the next provider regardless of why this one failed
    // (missing key, auth error, or full chain exhausted) — alternates exist
    // precisely for this. Loop continues.
    void providerExhausted;
  }

  const status = lastStatus === 429 ? 429 : 502;
  return NextResponse.json(
    { error: `All providers exhausted (tried: ${tried.join(', ') || 'none — no keys set'}). Last: ${lastError}.` },
    { status },
  );
}

const PROVIDER_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  kintio: 'KINTIO_API_KEY',
  custom: 'LLM_API_KEY',
};

export async function GET() {
  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const keyName = PROVIDER_KEYS[provider] ?? 'LLM_API_KEY';
  const primary = process.env.LLM_MODEL ?? DEFAULT_MODELS[provider] ?? null;
  // Report every provider's key status so alternates are visible at a glance.
  const providers: Record<string, { configured: boolean; model: string | null }> = {};
  for (const [p, k] of Object.entries(PROVIDER_KEYS)) {
    providers[p] = {
      configured: Boolean(process.env[k]),
      model: process.env[`LLM_MODEL_${p.toUpperCase()}`] ?? (p === provider ? primary : (DEFAULT_MODELS[p] ?? null)),
    };
  }
  return NextResponse.json({
    provider,
    configured: Boolean(process.env[keyName]),
    model: primary,
    fallbacks: (process.env.LLM_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    fallbackProviders: (process.env.LLM_FALLBACK_PROVIDERS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    providers,
    freeOptions: ['kintio', 'gemini', 'groq', 'openrouter'],
    multiModelNote: 'Have one key for many models? Use LLM_PROVIDER=kintio (or openrouter / custom + LLM_BASE_URL) and set LLM_MODEL + LLM_FALLBACK_MODELS. Add LLM_FALLBACK_PROVIDERS="gemini,groq" for cross-provider failover.',
  });
}
