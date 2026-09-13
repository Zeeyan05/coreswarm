/**
 * CoreSwarm Dispute Resolution Engine
 *
 * Implements the resolution flow:
 * CLAIM -> CONFLICT -> DISPUTE -> EVIDENCE_REQUEST -> EVIDENCE_RESPONSE -> VERIFICATION -> RESOLUTION
 *
 * Possible outcomes:
 * - SUPPORTED_A
 * - SUPPORTED_B
 * - PARTIALLY_SUPPORTED
 * - INSUFFICIENT_EVIDENCE
 * - UNRESOLVED
 *
 * Rules:
 * - Original claims remain in the historical record and are never overwritten.
 * - If evidence is insufficient, explicit status is assigned rather than manufactured certainty.
 * - Adjudication is evidence-driven and unbiased: either side can win.
 */

import type { Claim } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { Dispute, DisputeResolutionOutcome } from '../types/verification';
import type { BaseAgent } from '../agents/base-agent';

/** Pluggable contradiction detector. Keep the default keyword logic as one implementation. */
export interface ConflictDetector {
  detectConflicts(claims: readonly Claim[]): Array<{ claimA: Claim; claimB: Claim; reason: string }>;
}

/** Pluggable adjudicator: scores each side's evidence, returns outcome + rationale. */
export interface DisputeAdjudicator {
  adjudicate(params: {
    claimA: Claim;
    claimB: Claim;
    evidenceA: readonly Evidence[];
    evidenceB: readonly Evidence[];
  }): { outcome: DisputeResolutionOutcome; adjudication: string };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const NEGATIONS = new Set([
  'not', 'no', 'never', 'without', 'lacks', 'fails', 'fails to', 'cannot', "can't",
  'allows', 'arbitrary', 'unvalidated', 'missing',
]);
const AFFIRMATIONS = new Set([
  'strictly', 'always', 'must', 'requires', 'enforces', 'validates', 'prevents', 'guarantees',
]);

/**
 * Generic contradiction detector: flags claim pairs from different agents that
 * share significant subject overlap but carry opposing polarity markers.
 * Falls back to numeric-mismatch detection (e.g. "86 chars" vs "64 chars").
 */
export class GenericConflictDetector implements ConflictDetector {
  detectConflicts(claims: readonly Claim[]): Array<{ claimA: Claim; claimB: Claim; reason: string }> {
    const conflicts: Array<{ claimA: Claim; claimB: Claim; reason: string }> = [];
    const paired = new Set<string>();

    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i]!;
        const b = claims[j]!;
        if (a.origin_agent === b.origin_agent) continue;
        if (paired.has(a.claim_id) || paired.has(b.claim_id)) continue;

        const wordsA = new Set(normalize(a.statement).split(' ').filter((w) => w.length > 3));
        const wordsB = new Set(normalize(b.statement).split(' ').filter((w) => w.length > 3));
        const overlap = [...wordsA].filter((w) => wordsB.has(w));

        const textA = a.statement.toLowerCase();
        const textB = b.statement.toLowerCase();
        const aNeg = [...NEGATIONS].some((n) => textA.includes(n));
        const bNeg = [...NEGATIONS].some((n) => textB.includes(n));
        const aAff = [...AFFIRMATIONS].some((n) => textA.includes(n));
        const bAff = [...AFFIRMATIONS].some((n) => textB.includes(n));
        const polaritySplit = (aAff && bNeg) || (bAff && aNeg);

        // Numeric mismatch: both cite different numbers on overlapping subject
        const numsA: string[] = textA.match(/\d+/g) ?? [];
        const numsB: string[] = textB.match(/\d+/g) ?? [];
        const numericClash =
          overlap.length >= 2 && numsA.length > 0 && numsB.length > 0 &&
          !numsA.some((n) => numsB.includes(n));

        if (overlap.length >= 3 && (polaritySplit || numericClash)) {
          paired.add(a.claim_id);
          paired.add(b.claim_id);
          conflicts.push({
            claimA: a,
            claimB: b,
            reason: numericClash && !polaritySplit
              ? `Numeric contradiction on shared subject (${overlap.slice(0, 4).join(', ')}): '${numsA.join(',')}' vs '${numsB.join(',')}'.`
              : `Contradictory assertions on shared subject (${overlap.slice(0, 4).join(', ')}) with opposing polarity.`,
          });
        }
      }
    }

    return conflicts;
  }
}

/** Legacy keyword detector preserved for the Technocore audit preset. */
export class SigPatternConflictDetector extends GenericConflictDetector {
  override detectConflicts(claims: readonly Claim[]): Array<{ claimA: Claim; claimB: Claim; reason: string }> {
    const generic = super.detectConflicts(claims);
    if (generic.length > 0) return generic;

    // Narrow legacy fallback: signature-terminal keyword pair
    const conflicts: Array<{ claimA: Claim; claimB: Claim; reason: string }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i]!;
        const b = claims[j]!;
        if (seen.has(a.claim_id) || seen.has(b.claim_id)) continue;
        if (a.origin_agent === b.origin_agent) continue;
        const textA = a.statement.toLowerCase();
        const textB = b.statement.toLowerCase();
        const bothMentionTerminals =
          (textA.includes('terminal') || textA.includes('[aqgw]')) &&
          (textB.includes('terminal') || textB.includes('[aqgw]'));
        const split =
          (textA.includes('strictly') && textB.includes('arbitrary')) ||
          (textB.includes('strictly') && textA.includes('arbitrary'));
        if (bothMentionTerminals && split) {
          seen.add(a.claim_id);
          seen.add(b.claim_id);
          conflicts.push({
            claimA: textA.includes('strictly') ? a : b,
            claimB: textA.includes('arbitrary') ? a : b,
            reason: 'Direct contradiction regarding signature terminal character validation [AQgw].',
          });
        }
      }
    }
    return conflicts;
  }
}

function scoreEvidence(list: readonly Evidence[], claimId: string): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  for (const e of list) {
    if (e.claim_id !== claimId && !e.evidence_id.startsWith('ev_supp_')) {
      notes.push(`${e.evidence_id}: not bound to this claim`);
      continue;
    }
    const len = e.extract.trim().length;
    if (len < 40) {
      notes.push(`${e.evidence_id}: extract too brief`);
      continue;
    }
    if (!e.source?.trim() || !e.locator?.trim()) {
      notes.push(`${e.evidence_id}: missing source/locator`);
      continue;
    }
    score += 1;
    if (len >= 120) score += 1;
  }
  return { score, notes };
}

/** Default unbiased adjudicator: each side scored on bound, sourced, substantive extracts. */
export class EvidenceScoreAdjudicator implements DisputeAdjudicator {
  adjudicate(params: {
    claimA: Claim;
    claimB: Claim;
    evidenceA: readonly Evidence[];
    evidenceB: readonly Evidence[];
  }): { outcome: DisputeResolutionOutcome; adjudication: string } {
    const a = scoreEvidence(params.evidenceA, params.claimA.claim_id);
    const b = scoreEvidence(params.evidenceB, params.claimB.claim_id);

    if (a.score === 0 && b.score === 0) {
      return {
        outcome: 'INSUFFICIENT_EVIDENCE',
        adjudication: `Neither ${params.claimA.origin_agent} nor ${params.claimB.origin_agent} produced bound, sourced extracts. Dispute marked INSUFFICIENT_EVIDENCE.`,
      };
    }
    if (a.score > b.score) {
      return {
        outcome: 'SUPPORTED_A',
        adjudication: `Claimant ${params.claimA.origin_agent} prevails on evidence weight (${a.score} vs ${b.score} qualifying extracts).`,
      };
    }
    if (b.score > a.score) {
      return {
        outcome: 'SUPPORTED_B',
        adjudication: `Challenger ${params.claimB.origin_agent} prevails on evidence weight (${b.score} vs ${a.score} qualifying extracts).`,
      };
    }
    return {
      outcome: 'PARTIALLY_SUPPORTED',
      adjudication: `Both sides produced equal evidence weight (${a.score}). Partial support; risk noted.`,
    };
  }
}

export class DisputeEngine {
  readonly #disputes = new Map<string, Dispute>();
  readonly #detector: ConflictDetector;
  readonly #adjudicator: DisputeAdjudicator;

  constructor(detector?: ConflictDetector, adjudicator?: DisputeAdjudicator) {
    this.#detector = detector ?? new GenericConflictDetector();
    this.#adjudicator = adjudicator ?? new EvidenceScoreAdjudicator();
  }

  /**
   * Detect potential conflicts between claims from different agents.
   */
  detectConflicts(claims: readonly Claim[]): Array<{ claimA: Claim; claimB: Claim; reason: string }> {
    return this.#detector.detectConflicts(claims);
  }

  /**
   * Create a formal dispute. The original claim is preserved.
   */
  createDispute(params: {
    mission_id: string;
    claimA: Claim;
    claimB: Claim;
    reason: string;
    counter_evidence: readonly Evidence[];
  }): Dispute {
    const disputeId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dispute: Dispute = {
      dispute_id: disputeId,
      mission_id: params.mission_id,
      claim_id: params.claimA.claim_id,
      counter_claim_id: params.claimB.claim_id,
      claimant_agent: params.claimA.origin_agent,
      challenger_agent: params.claimB.origin_agent,
      reason: params.reason,
      counter_evidence: params.counter_evidence,
      status: 'OPEN',
      created_at: new Date().toISOString(),
    };

    this.#disputes.set(disputeId, dispute);
    return dispute;
  }

  /**
   * Request additional evidence from participating agents and resolve the dispute.
   * Either side can win; scoring is symmetric.
   */
  async resolveDispute(
    dispute: Dispute,
    claimA: Claim,
    claimB: Claim,
    agents: Record<string, BaseAgent>,
    evidenceGraph: Record<string, Evidence>,
  ): Promise<Dispute> {
    let supplementalA: Evidence[] = [];
    const agentA = agents[claimA.origin_agent];
    if (agentA) {
      supplementalA = await agentA.handleEvidenceRequest(claimA.claim_id, dispute.reason);
    }

    let supplementalB: Evidence[] = [];
    const agentB = agents[claimB.origin_agent];
    if (agentB) {
      supplementalB = await agentB.handleEvidenceRequest(claimB.claim_id, dispute.reason);
    }

    const graphA = claimA.evidence_refs.map((id) => evidenceGraph[id]).filter((e): e is Evidence => Boolean(e));
    const graphB = claimB.evidence_refs.map((id) => evidenceGraph[id]).filter((e): e is Evidence => Boolean(e));

    // Dedupe by evidence_id: counter_evidence and supplemental caches often
    // repeat graph entries; counting them twice would bias the scoring.
    const dedupe = (list: readonly Evidence[]): Evidence[] => {
      const seen = new Set<string>();
      return list.filter((e) => {
        if (seen.has(e.evidence_id)) return false;
        seen.add(e.evidence_id);
        return true;
      });
    };

    const { outcome, adjudication } = this.#adjudicator.adjudicate({
      claimA,
      claimB,
      evidenceA: dedupe([...graphA, ...supplementalA]),
      evidenceB: dedupe([...graphB, ...supplementalB, ...dispute.counter_evidence]),
    });

    const resolved: Dispute = {
      ...dispute,
      status: 'RESOLVED',
      outcome,
      adjudication,
      resolved_at: new Date().toISOString(),
    };

    this.#disputes.set(dispute.dispute_id, resolved);
    return resolved;
  }

  getDispute(disputeId: string): Dispute | undefined {
    return this.#disputes.get(disputeId);
  }

  getAllDisputes(): Dispute[] {
    return Array.from(this.#disputes.values());
  }
}
