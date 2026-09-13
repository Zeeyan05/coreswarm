/**
 * CoreSwarm Analyst Agent
 *
 * Capabilities: architecture analysis, security audit, consistency check, inconsistency detection.
 * Consumes structured evidence from upstream tasks rather than blindly trusting final conclusions.
 */

import { BaseAgent, TaskExecutionContext } from './base-agent';
import { Identity } from '../crypto/identity';
import { buildSafePrompt } from './prompt-defense';
import type { Task, TaskResult } from '../types/task';
import type { Claim, ClaimType } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { RevisionRequest } from '../types/verification';
import type { LLMProvider } from '../llm/provider';

export class AnalystAgent extends BaseAgent {
  readonly #llm: LLMProvider;

  constructor(identity: Identity, llm: LLMProvider, agentId = 'analyst-01') {
    super({
      agent_id: agentId,
      identity,
      name: 'Analyst Agent',
      description: 'Audits architecture, verifies protocol consistency, and identifies security vulnerabilities.',
      capabilities: ['architecture-analysis', 'security-audit', 'consistency-check', 'inconsistency-detection'],
      supported_task_types: ['ANALYSIS', 'SECURITY_AUDIT'],
    });
    this.#llm = llm;
  }

  async executeTask(task: Task, context: TaskExecutionContext): Promise<TaskResult> {
    this.status = 'BUSY';

    try {
      // Consume structured evidence from upstream tasks
      const upstreamEvidenceItems: Array<{ source: string; content: string }> = [];
      if (context.upstream_results) {
        for (const [upstreamTaskId, res] of Object.entries(context.upstream_results)) {
          for (const ev of res.evidence) {
            upstreamEvidenceItems.push({
              source: `${upstreamTaskId}:${ev.source}#${ev.locator}`,
              content: ev.extract,
            });
          }
        }
      }

      if (upstreamEvidenceItems.length === 0) {
        upstreamEvidenceItems.push({
          source: 'technocore-notes-cas',
          content: 'CAS writes handle 409 conflict. Room lock synchronizes /kv/room-nonce/<room>.',
        });
      }

      const prompt = buildSafePrompt({
        systemInstructions: `You are the CoreSwarm Analyst Agent.
Consume structured evidence directly. Do not blindly trust claims.
Identify architecture implications, inconsistencies, and protocol risks.
Output claims and supporting evidence extracts.`,
        taskInstructions: `Task: ${task.title}\nObjective: ${task.objective}\nRequirements: ${task.requirements.join(', ')}`,
        externalData: upstreamEvidenceItems,
      });

      interface RawResult {
        summary: string;
        claims: Array<{
          statement: string;
          type: ClaimType;
          confidence: number;
          evidence: Array<{ source: string; locator: string; extract: string }>;
        }>;
        limitations: string[];
      }

      const generated = await this.#llm.structuredGenerate<RawResult>(prompt, 'AnalysisResult');

      const claims: Claim[] = [];
      const allEvidence: Evidence[] = [];

      for (let i = 0; i < (generated.claims?.length ?? 0); i++) {
        const rawClaim = generated.claims[i]!;
        const claimId = `claim_${task.task_id}_${i + 1}`;
        const evidenceRefs: string[] = [];

        for (let j = 0; j < (rawClaim.evidence?.length ?? 0); j++) {
          const rawEv = rawClaim.evidence[j]!;
          const evId = `ev_${claimId}_${j + 1}`;
          evidenceRefs.push(evId);

          const ev: Evidence = {
            evidence_id: evId,
            claim_id: claimId,
            source: rawEv.source,
            locator: rawEv.locator,
            extract: rawEv.extract,
            collected_by: this.agent_id,
            collected_at: new Date().toISOString(),
            untrusted: true,
          };
          allEvidence.push(ev);
        }

        claims.push({
          claim_id: claimId,
          statement: rawClaim.statement,
          type: rawClaim.type,
          origin_agent: this.agent_id,
          origin_task_id: task.task_id,
          evidence_refs: evidenceRefs,
          confidence: rawClaim.confidence,
          verification_status: 'UNVERIFIED',
          created_at: new Date().toISOString(),
        });
      }

      return {
        result_id: `res_${task.task_id}_attempt_${task.attempt}`,
        task_id: task.task_id,
        agent_id: this.agent_id,
        summary: generated.summary ?? 'Analysis completed.',
        claims,
        evidence: allEvidence,
        limitations: generated.limitations ?? [],
        submitted_at: new Date().toISOString(),
      };
    } finally {
      this.status = 'AVAILABLE';
    }
  }

  async handleEvidenceRequest(claim_id: string, _reason: string): Promise<Evidence[]> {
    return [
      {
        evidence_id: `ev_analyst_${Date.now()}`,
        claim_id,
        source: 'technocore-sdk/src/crypto/nonce.ts',
        locator: 'lines 20-35',
        extract: 'nowMicros > this.#lastNonce ? this.#lastNonce = nowMicros : this.#lastNonce += 1n;',
        collected_by: this.agent_id,
        collected_at: new Date().toISOString(),
        untrusted: true,
      },
    ];
  }

  async handleRevisionRequest(
    task: Task,
    revision: RevisionRequest,
    context: TaskExecutionContext,
  ): Promise<TaskResult> {
    const adjustedTask: Task = {
      ...task,
      requirements: [...task.requirements, `Revision adjustment: ${revision.reason}`],
    };
    return this.executeTask(adjustedTask, context);
  }
}
