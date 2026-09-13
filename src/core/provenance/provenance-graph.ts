/**
 * CoreSwarm Provenance Graph
 *
 * Maintains the backward traceability chain:
 * SOURCE -> EVIDENCE -> CLAIM -> AGENT RESULT -> VERIFICATION -> FINAL CONCLUSION
 *
 * Answers: "Why does CoreSwarm believe this?"
 */

import type { Claim } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { TaskResult } from '../types/task';
import type { VerificationDecision } from '../types/verification';

export interface TraceStep {
  readonly level: 'FINAL_CONCLUSION' | 'VERIFICATION' | 'CLAIM' | 'RESULT' | 'EVIDENCE' | 'SOURCE' | 'MISSING_EVIDENCE';
  readonly id: string;
  readonly description: string;
  readonly details: Record<string, unknown>;
}

export class ProvenanceGraph {
  readonly #sources = new Map<string, Set<string>>(); // source -> Set<evidence_id>
  readonly #evidence = new Map<string, Evidence>(); // evidence_id -> Evidence
  readonly #claims = new Map<string, Claim>(); // claim_id -> Claim
  readonly #results = new Map<string, TaskResult>(); // result_id -> TaskResult
  readonly #verifications = new Map<string, VerificationDecision>(); // claim_id -> VerificationDecision

  recordEvidence(evidence: Evidence): void {
    this.#evidence.set(evidence.evidence_id, evidence);
    if (!this.#sources.has(evidence.source)) {
      this.#sources.set(evidence.source, new Set());
    }
    this.#sources.get(evidence.source)!.add(evidence.evidence_id);
  }

  recordClaim(claim: Claim): void {
    this.#claims.set(claim.claim_id, claim);
  }

  recordResult(result: TaskResult): void {
    this.#results.set(result.result_id, result);
    for (const c of result.claims) {
      this.recordClaim(c);
    }
    for (const e of result.evidence) {
      this.recordEvidence(e);
    }
  }

  recordVerification(decision: VerificationDecision): void {
    this.#verifications.set(decision.claim_id, decision);
  }

  /**
   * Answer: "Why does CoreSwarm believe this?"
   * Traces a claim or conclusion backward to its empirical sources.
   */
  traceBackward(claimId: string): TraceStep[] {
    const steps: TraceStep[] = [];
    const claim = this.#claims.get(claimId);

    if (!claim) {
      return [{
        level: 'CLAIM',
        id: claimId,
        description: `Claim '${claimId}' not found in provenance graph.`,
        details: {},
      }];
    }

    // 1. Verification decision
    const verification = this.#verifications.get(claimId);
    if (verification) {
      steps.push({
        level: 'VERIFICATION',
        id: `ver_${claimId}`,
        description: `Verification status: ${verification.status} by ${verification.verifier}`,
        details: {
          status: verification.status,
          verifier: verification.verifier,
          reason: verification.reason,
          created_at: verification.created_at,
        },
      });
    }

    // 2. Claim step
    steps.push({
      level: 'CLAIM',
      id: claim.claim_id,
      description: `[${claim.type}] "${claim.statement}" (Confidence: ${(claim.confidence * 100).toFixed(0)}%)`,
      details: {
        type: claim.type,
        statement: claim.statement,
        confidence: claim.confidence,
        origin_agent: claim.origin_agent,
        origin_task: claim.origin_task_id,
      },
    });

    // 3. Evidence and Sources — dangling refs emit MISSING_EVIDENCE, never skipped silently
    for (const evId of claim.evidence_refs) {
      const ev = this.#evidence.get(evId);
      if (!ev) {
        steps.push({
          level: 'MISSING_EVIDENCE',
          id: evId,
          description: `Cited evidence '${evId}' is absent from the provenance graph (dangling reference).`,
          details: { evidence_id: evId, claim_id: claim.claim_id },
        });
        continue;
      }
      steps.push({
        level: 'EVIDENCE',
        id: ev.evidence_id,
        description: `Evidence cited: "${ev.extract.slice(0, 80)}..."`,
        details: {
          source: ev.source,
          locator: ev.locator,
          extract: ev.extract,
          collected_by: ev.collected_by,
        },
      });

      steps.push({
        level: 'SOURCE',
        id: `${ev.source}#${ev.locator}`,
        description: `Origin source: ${ev.source} (${ev.locator})`,
        details: {
          source: ev.source,
          locator: ev.locator,
        },
      });
    }

    return steps;
  }

  getAllEvidence(): Evidence[] {
    return Array.from(this.#evidence.values());
  }

  getAllClaims(): Claim[] {
    return Array.from(this.#claims.values());
  }
}
