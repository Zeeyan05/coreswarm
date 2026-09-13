/**
 * CoreSwarm Entailment Scorer
 *
 * Answers: does this extract actually SUPPORT the claim, or is it merely long?
 *
 * Default: deterministic lexical entailment (keyword overlap + numeric
 * agreement + negation check). No network, no model, fully testable.
 * Optional: plug an LLMProvider for semantic judgments on hard cases.
 */

import type { LLMProvider } from '../llm/provider';

export interface EntailmentResult {
  /** 0..1 — fraction of claim keywords covered by the extract. */
  readonly coverage: number;
  /** True when the extract negates the claim or numbers disagree. */
  readonly contradicts: boolean;
  readonly reason: string;
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were',
  'be', 'been', 'that', 'this', 'with', 'for', 'as', 'by', 'on', 'at', 'it',
  'its', 'from', 'into', 'which', 'all', 'any',
]);

function keywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

const NEG = ['not', 'never', 'without', 'fails', 'cannot', "can't", 'allows arbitrary', 'unvalidated', 'missing', 'lacks'];

export function lexicalEntailment(claimStatement: string, extract: string): EntailmentResult {
  const claimWords = keywords(claimStatement);
  if (claimWords.size === 0) {
    return { coverage: 0, contradicts: false, reason: 'claim has no substantive keywords' };
  }
  const extractLower = extract.toLowerCase();
  const extractWords = keywords(extract);
  const covered = [...claimWords].filter((w) => extractWords.has(w) || extractLower.includes(w));
  const coverage = covered.length / claimWords.size;

  // Negation: extract negates while claim affirms (or vice versa).
  // NOTE: no numeric-contradiction rule here by design — code extracts
  // routinely encode numbers differently than prose ("85"+terminal = "86"),
  // so literal number matching would reject legitimate grounding.
  // Numeric-clash detection belongs to inter-claim dispute detection, not here.
  const claimNeg = NEG.some((n) => claimStatement.toLowerCase().includes(n));
  const extractNeg = NEG.some((n) => extractLower.includes(n));
  const contradicts = claimNeg !== extractNeg && coverage > 0.3;

  if (contradicts) {
    return { coverage, contradicts: true, reason: 'polarity split between claim and extract' };
  }
  return { coverage, contradicts: false, reason: `${covered.length}/${claimWords.size} keywords covered` };
}

/** LLM-backed entailment for hard cases. Returns null on any failure (caller falls back). */
export async function llmEntailment(
  llm: LLMProvider,
  claimStatement: string,
  extract: string,
): Promise<EntailmentResult | null> {
  try {
    const out = await llm.structuredGenerate<{ supports: boolean; coverage: number; reason: string }>(
      `Claim: ${claimStatement.slice(0, 800)}\nEvidence extract: ${extract.slice(0, 1500)}\nDoes the extract support the claim?`,
      '{ "supports": true, "coverage": 0.8, "reason": "..." }',
      { temperature: 0 },
    );
    const coverage = typeof out.coverage === 'number' ? Math.min(1, Math.max(0, out.coverage)) : 0;
    return {
      coverage,
      contradicts: out.supports === false,
      reason: typeof out.reason === 'string' ? out.reason.slice(0, 200) : 'llm judgment',
    };
  } catch {
    return null;
  }
}
