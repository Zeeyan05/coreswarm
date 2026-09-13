/**
 * CoreSwarm Verification Engine
 *
 * Implements deterministic claim verification algorithms.
 */

import type { Claim, ClaimVerificationStatus } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { VerificationDecision } from '../types/verification';
import { lexicalEntailment } from './entailment';

/**
 * Minimum keyword coverage for an extract to count as supporting its claim.
 * Deliberately lenient (1 in 5 keywords): code extracts encode meaning in
 * identifiers/symbols that prose paraphrases, so lexical overlap understates
 * real support. This gate rejects unrelated extracts, not paraphrases —
 * genuine semantic judgment belongs to the LLM entailment hook.
 */
const MIN_COVERAGE = 0.2;

/**
 * Minimum quality bar for an evidence extract to count toward verification.
 * Extracts must cite a real source + locator AND carry substantive content.
 */
const MIN_EXTRACT_LENGTH = 40;

function assessEvidenceQuality(ev: Evidence, claim: Claim): { ok: boolean; reason: string } {
  const extract = ev.extract.trim();
  if (extract.length < MIN_EXTRACT_LENGTH) {
    return { ok: false, reason: `extract too brief (${extract.length} chars, need ${MIN_EXTRACT_LENGTH})` };
  }
  if (!ev.source || !ev.source.trim()) {
    return { ok: false, reason: 'missing source citation' };
  }
  if (!ev.locator || !ev.locator.trim()) {
    return { ok: false, reason: 'missing locator (line numbers / path / hash)' };
  }
  if (ev.claim_id !== claim.claim_id) {
    return { ok: false, reason: `evidence bound to '${ev.claim_id}', not this claim` };
  }
  const entail = lexicalEntailment(claim.statement, extract);
  if (entail.contradicts) {
    return { ok: false, reason: `extract contradicts claim (${entail.reason})` };
  }
  if (entail.coverage < MIN_COVERAGE) {
    return { ok: false, reason: `extract does not support claim (coverage ${(entail.coverage * 100).toFixed(0)}%, need ${(MIN_COVERAGE * 100).toFixed(0)}%: ${entail.reason})` };
  }
  return { ok: true, reason: '' };
}

export class VerifierEngine {
  /**
   * Verify an array of claims against an evidence graph.
   *
   * Rules:
   * - Dangling refs (IDs absent from the graph) are reported, never silently skipped.
   * - Evidence must cite source + locator, bind to this claim, carry substantive
   *   content, AND lexically support the claim (keyword coverage + no contradiction).
   * - VERIFIED means "grounded in supporting extracts", not "proven true".
   */
  verifyClaims(
    claims: readonly Claim[],
    evidenceGraph: Record<string, Evidence>,
    verifierId: string,
  ): { updatedClaims: Claim[]; decisions: VerificationDecision[] } {
    const updatedClaims: Claim[] = [];
    const decisions: VerificationDecision[] = [];

    for (const claim of claims) {
      const missingRefs = claim.evidence_refs.filter((ref) => evidenceGraph[ref] === undefined);
      const citedEvidence = claim.evidence_refs
        .map((ref) => evidenceGraph[ref])
        .filter((ev): ev is Evidence => ev !== undefined);

      let status: ClaimVerificationStatus = 'UNVERIFIED';
      let reason = '';

      if (claim.evidence_refs.length === 0) {
        status = 'INSUFFICIENT_EVIDENCE';
        reason = 'Claim cites no evidence references.';
      } else if (citedEvidence.length === 0) {
        status = 'INSUFFICIENT_EVIDENCE';
        reason = `All ${claim.evidence_refs.length} cited reference(s) are dangling (absent from evidence graph): ${claim.evidence_refs.join(', ')}.`;
      } else {
        const quality = citedEvidence.map((e) => ({ ev: e, ...assessEvidenceQuality(e, claim) }));
        const good = quality.filter((q) => q.ok);
        const badReasons = quality.filter((q) => !q.ok).map((q) => `${q.ev.evidence_id}: ${q.reason}`);

        if (good.length > 0 && missingRefs.length === 0) {
          status = 'VERIFIED';
          reason = `Grounded in ${good.length} cited extract(s) with source + locator.${badReasons.length > 0 ? ` Discounted: ${badReasons.join('; ')}.` : ''}`;
        } else if (good.length > 0) {
          status = 'PARTIALLY_VERIFIED';
          reason = `Grounded in ${good.length} extract(s), but ${missingRefs.length} reference(s) dangle: ${missingRefs.join(', ')}.`;
        } else {
          status = 'INSUFFICIENT_EVIDENCE';
          reason = `No cited extract meets the quality bar. ${badReasons.join('; ')}.`;
        }
      }

      const decision: VerificationDecision = {
        claim_id: claim.claim_id,
        status,
        reason,
        evidence_refs: citedEvidence.map((e) => e.evidence_id),
        verifier: verifierId,
        created_at: new Date().toISOString(),
      };

      decisions.push(decision);

      updatedClaims.push({
        ...claim,
        verification_status: status,
        verified_by: verifierId,
        verification_reason: reason,
      });
    }

    return { updatedClaims, decisions };
  }
}
