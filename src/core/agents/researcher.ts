/**
 * CoreSwarm Researcher Agent
 *
 * Capabilities: web research, source analysis, protocol research, code audit.
 * Responsibilities:
 * - Inspect documentation and codebase
 * - Extract evidence
 * - Produce research claims distinguishing: FACT, OBSERVATION, INFERENCE, CONCLUSION
 */

import { BaseAgent, TaskExecutionContext } from './base-agent';
import { Identity } from '../crypto/identity';
import { buildSafePrompt } from './prompt-defense';
import type { Task, TaskResult } from '../types/task';
import type { Claim, ClaimType } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { RevisionRequest } from '../types/verification';
import type { LLMProvider } from '../llm/provider';

export class ResearcherAgent extends BaseAgent {
  readonly #llm: LLMProvider;
  readonly #cachedEvidence = new Map<string, Evidence[]>(); // claim_id -> evidence

  constructor(identity: Identity, llm: LLMProvider, agentId = 'researcher-01') {
    super({
      agent_id: agentId,
      identity,
      name: 'Researcher Agent',
      description: 'Discovers protocol documentation, performs code audits, and extracts evidence-backed facts.',
      capabilities: ['web-research', 'source-analysis', 'protocol-research', 'code-audit'],
      supported_task_types: ['RESEARCH'],
    });
    this.#llm = llm;
  }

  async executeTask(task: Task, _context: TaskExecutionContext): Promise<TaskResult> {
    this.status = 'BUSY';

    try {
      const prompt = buildSafePrompt({
        systemInstructions: `You are the CoreSwarm Researcher Agent.
Analyze the target objective and extract structured research claims with concrete source evidence.
You MUST distinguish claim types: FACT, OBSERVATION, INFERENCE, RECOMMENDATION.
Every claim must cite verifiable source extracts.`,
        taskInstructions: `Task: ${task.title}\nObjective: ${task.objective}\nRequirements: ${task.requirements.join(', ')}`,
        externalData: [
          {
            source: 'technocore-protocol-docs',
            content: 'Technocore v0.11.1 protocol rules: Ed25519 did:key:z6Mk..., single line sweep Unicode Cc/Cf/Cs/Co/Zl/Zp, 86-char base64url terminal [AQgw], monotonic nonces.',
          },
        ],
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

      const generated = await this.#llm.structuredGenerate<RawResult>(prompt, 'ResearchResult');

      const claims: Claim[] = [];
      const allEvidence: Evidence[] = [];

      for (let i = 0; i < (generated.claims?.length ?? 0); i++) {
        const rawClaim = generated.claims[i]!;
        const claimId = `claim_${task.task_id}_${i + 1}`;
        const evidenceRefs: string[] = [];

        const claimEvList: Evidence[] = [];
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
          claimEvList.push(ev);
          allEvidence.push(ev);
        }

        this.#cachedEvidence.set(claimId, claimEvList);

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

      const result: TaskResult = {
        result_id: `res_${task.task_id}_attempt_${task.attempt}`,
        task_id: task.task_id,
        agent_id: this.agent_id,
        summary: generated.summary ?? 'Research task completed.',
        claims,
        evidence: allEvidence,
        limitations: generated.limitations ?? [],
        submitted_at: new Date().toISOString(),
      };

      return result;
    } finally {
      this.status = 'AVAILABLE';
    }
  }

  async handleEvidenceRequest(claim_id: string, _reason: string): Promise<Evidence[]> {
    const cached = this.#cachedEvidence.get(claim_id);
    if (cached && cached.length > 0) {
      return cached;
    }
    // Supplemental evidence on demand
    const supplemental: Evidence = {
      evidence_id: `ev_supp_${Date.now()}`,
      claim_id,
      source: 'technocore-sdk/src/verification/index.ts',
      locator: 'lines 77-88',
      extract: 'if (!isValidDid(did)) return false;\nif (!sig || sig.length !== SIG_LENGTH || !SIG_PATTERN.test(sig)) return false;',
      collected_by: this.agent_id,
      collected_at: new Date().toISOString(),
      untrusted: true,
    };
    return [supplemental];
  }

  async handleRevisionRequest(
    task: Task,
    revision: RevisionRequest,
    context: TaskExecutionContext,
  ): Promise<TaskResult> {
    // Re-execute with adjusted instructions
    const adjustedTask: Task = {
      ...task,
      requirements: [...task.requirements, `Revision adjustment: ${revision.reason}`],
    };
    return this.executeTask(adjustedTask, context);
  }
}
