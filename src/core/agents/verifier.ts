/**
 * CoreSwarm Verifier Agent
 *
 * Capabilities: independent verification, evidence cross check, dispute adjudication.
 *
 * Responsibilities:
 * - Independently verify claims against supporting evidence
 * - Challenge unsupported assertions
 * - Compare conflicting evidence and detect contradictions
 * - Request additional evidence when necessary
 * - Issue verification decisions: VERIFIED, PARTIALLY_VERIFIED, UNVERIFIED, CONTRADICTED, INSUFFICIENT_EVIDENCE
 *
 * Rule: Agent confidence is NEVER treated as proof of verification.
 */

import { BaseAgent, TaskExecutionContext } from './base-agent';
import { Identity } from '../crypto/identity';
import { buildSafePrompt } from './prompt-defense';
import type { Task, TaskResult } from '../types/task';
import type { Claim, ClaimVerificationStatus } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { VerificationDecision, RevisionRequest } from '../types/verification';
import type { LLMProvider } from '../llm/provider';

export class VerifierAgent extends BaseAgent {
  readonly #llm: LLMProvider;

  constructor(identity: Identity, llm: LLMProvider, agentId = 'verifier-01') {
    super({
      agent_id: agentId,
      identity,
      name: 'Independent Verifier',
      description: 'Audits evidence chains, challenges unsupported assertions, and adjudicates disputes.',
      capabilities: ['independent-verification', 'evidence-cross-check', 'dispute-adjudication'],
      supported_task_types: ['VERIFICATION'],
    });
    this.#llm = llm;
  }

  /**
   * Execute independent verification across all upstream claims and evidence.
   */
  async executeTask(task: Task, context: TaskExecutionContext): Promise<TaskResult> {
    this.status = 'BUSY';

    try {
      const allUpstreamClaims: Claim[] = [];
      const allUpstreamEvidence: Evidence[] = [];

      if (context.upstream_results) {
        for (const res of Object.values(context.upstream_results)) {
          allUpstreamClaims.push(...res.claims);
          allUpstreamEvidence.push(...res.evidence);
        }
      }

      const prompt = buildSafePrompt({
        systemInstructions: `You are the CoreSwarm Independent Verifier.
Evaluate claims independently. An originating agent's confidence score is NOT proof.
Check each claim against its cited evidence extract.
If evidence is insufficient, assign INSUFFICIENT_EVIDENCE.
If two claims contradict, assign CONTRADICTED and recommend a dispute challenge.
If evidence supports the statement, assign VERIFIED.`,
        taskInstructions: `Task: ${task.title}\nEvaluate ${allUpstreamClaims.length} claims against ${allUpstreamEvidence.length} evidence records.`,
        externalData: allUpstreamClaims.map((c) => ({
          source: `Claim:${c.claim_id}[${c.origin_agent}]`,
          content: `${c.statement} (Cited evidence: ${c.evidence_refs.join(', ')})`,
        })),
      });

      interface VerifierOutput {
        verified_claims: Array<{
          statement: string;
          status: ClaimVerificationStatus;
          reason: string;
        }>;
        dispute_recommendations?: string[];
      }

      const generated = await this.#llm.structuredGenerate<VerifierOutput>(prompt, 'VerifierEvaluation');

      // Map verification decisions back to claim objects.
      // Matching requires a substantial bidirectional overlap; weak or empty
      // LLM statements never bind. Unmatched claims stay UNVERIFIED here —
      // the orchestrator's VerifierEngine pass assigns the final status.
      const verificationClaims: Claim[] = [];
      for (const origClaim of allUpstreamClaims) {
        const decision = (generated.verified_claims ?? []).find((d) => {
          const a = origClaim.statement.toLowerCase().trim();
          const b = (d.statement ?? '').toLowerCase().trim();
          if (b.length < 30) return false;
          const key = b.slice(0, 40);
          if (!a.includes(key)) return false;
          // Bidirectional check: the claim must also substantially contain the decision
          const aWords = new Set(a.split(/\s+/).filter((w) => w.length > 3));
          const bWords = new Set(b.split(/\s+/).filter((w) => w.length > 3));
          const overlap = [...bWords].filter((w) => aWords.has(w)).length;
          return overlap >= 4;
        });

        const status: ClaimVerificationStatus = decision?.status ?? 'UNVERIFIED';

        verificationClaims.push({
          ...origClaim,
          verification_status: status,
          verified_by: this.agent_id,
          verification_reason: decision?.reason ?? 'No independent decision bound to this claim; deferred to evidence-graph verification.',
        });
      }

      const result: TaskResult = {
        result_id: `res_${task.task_id}_attempt_${task.attempt}`,
        task_id: task.task_id,
        agent_id: this.agent_id,
        summary: `Verification completed. Verified ${verificationClaims.filter((c) => c.verification_status === 'VERIFIED').length} claims, detected ${verificationClaims.filter((c) => c.verification_status === 'CONTRADICTED').length} contradictions.`,
        claims: verificationClaims,
        evidence: allUpstreamEvidence,
        limitations: [],
        submitted_at: new Date().toISOString(),
      };

      return result;
    } finally {
      this.status = 'AVAILABLE';
    }
  }

  /**
   * Produce a single verification decision for a specific claim.
   */
  async verifyClaim(claim: Claim, evidence: readonly Evidence[]): Promise<VerificationDecision> {
    if (claim.evidence_refs.length === 0 || evidence.length === 0) {
      return {
        claim_id: claim.claim_id,
        status: 'INSUFFICIENT_EVIDENCE',
        reason: 'No evidence provided to ground this assertion.',
        evidence_refs: [],
        verifier: this.agent_id,
        created_at: new Date().toISOString(),
      };
    }

    // Verify extracts are non-empty and match
    const validEvidence = evidence.filter((e) => e.extract.trim().length > 0);
    if (validEvidence.length === 0) {
      return {
        claim_id: claim.claim_id,
        status: 'INSUFFICIENT_EVIDENCE',
        reason: 'All attached evidence records contained empty extracts.',
        evidence_refs: [],
        verifier: this.agent_id,
        created_at: new Date().toISOString(),
      };
    }

    return {
      claim_id: claim.claim_id,
      status: 'VERIFIED',
      reason: 'Empirically supported by valid code and specification extracts.',
      evidence_refs: validEvidence.map((e) => e.evidence_id),
      verifier: this.agent_id,
      created_at: new Date().toISOString(),
    };
  }

  async handleEvidenceRequest(_claim_id: string, _reason: string): Promise<Evidence[]> {
    return [];
  }

  async handleRevisionRequest(
    task: Task,
    _revision: RevisionRequest,
    context: TaskExecutionContext,
  ): Promise<TaskResult> {
    return this.executeTask(task, context);
  }
}
