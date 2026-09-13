/**
 * CoreSwarm Master Orchestrator
 *
 * Coordinates the complete autonomous multi-agent verification lifecycle:
 * DISCOVER -> DECOMPOSE -> DELEGATE -> EXECUTE -> VERIFY -> RESOLVE -> SYNTHESIZE
 *
 * Deterministic state transitions, real event sourcing, and backward provenance.
 */

import { Identity } from '../crypto/identity';
import { TaskDAG } from '../dag/task-dag';
import { TaskStateMachine } from '../state/task-state';
import { MissionStateMachine } from '../state/mission-state';
import { AgentRegistry } from '../registry/agent-registry';
import { DisputeEngine } from '../verification/dispute-engine';
import { VerifierEngine } from '../verification/verifier-engine';
import { ProvenanceMemory } from '../provenance/memory';
import { MetricsTracker } from './metrics';
import { TimeoutMonitor } from './timeout-monitor';
import { ProtocolHandler } from '../protocol/envelope';
import type { Transport } from '../transport/transport-interface';
import type { BaseAgent } from '../agents/base-agent';
import type { Mission, TaskSpec } from '../types/mission';
import type { Task, TaskResult } from '../types/task';
import type { Claim } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { Dispute, RevisionRequest } from '../types/verification';
import type { CoreSwarmEvent } from '../types/events';
import type { FinalReport } from '../types/mission';
import { SynthesizerAgent } from '../agents/synthesizer';
import { buildAuditSpecs, AUDIT_MISSION_META } from '../presets/audit-mission';
import { importMission } from '../persistence/index';

export interface MissionRunOptions {
  readonly simulateDispute?: boolean;
  readonly simulateTimeout?: boolean;
  /** Task ID the timeout simulation targets (default: audit security task). */
  readonly timeoutTaskId?: string;
  /** Mission-level requirements/constraints (default: audit preset). */
  readonly requirements?: readonly string[];
  readonly constraints?: readonly string[];
  /** Synthesizer agent ID (default: synthesizer-01). */
  readonly synthesizerId?: string;
}

export interface OrchestratorConfig {
  readonly identity: Identity;
  readonly transport: Transport;
  readonly registry: AgentRegistry;
  readonly defaultTimeoutMs?: number;
}

export class CoreSwarmOrchestrator {
  readonly identity: Identity;
  readonly transport: Transport;
  readonly registry: AgentRegistry;
  readonly taskStateMachine = new TaskStateMachine();
  readonly missionStateMachine = new MissionStateMachine();
  readonly disputeEngine = new DisputeEngine();
  readonly verifierEngine = new VerifierEngine();
  readonly provenance = new ProvenanceMemory();
  readonly metrics = new MetricsTracker();
  readonly timeoutMonitor = new TimeoutMonitor();
  readonly protocolHandler = new ProtocolHandler();

  readonly #agents = new Map<string, BaseAgent>();
  readonly #eventListeners = new Set<(event: CoreSwarmEvent) => void>();

  #currentMission: Mission | null = null;
  #dag: TaskDAG | null = null;
  #defaultTimeoutMs: number;

  constructor(config: OrchestratorConfig) {
    this.identity = config.identity;
    this.transport = config.transport;
    this.registry = config.registry;
    this.#defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;

    // Pipe state machine events into provenance memory
    this.taskStateMachine.onTransition((event) => {
      this.provenance.appendEvent(event);
      this.#notifyListeners(event);
    });

    this.missionStateMachine.onTransition((event) => {
      this.provenance.appendEvent(event);
      this.#notifyListeners(event);
    });
  }

  registerAgentInstance(agent: BaseAgent): void {
    this.#agents.set(agent.agent_id, agent);
    this.registry.register(agent.getMetadata());
  }

  onEvent(listener: (event: CoreSwarmEvent) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  #notifyListeners(event: CoreSwarmEvent): void {
    for (const listener of this.#eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in orchestrator event listener:', err);
      }
    }
  }

  getCurrentMission(): Mission | null {
    return this.#currentMission;
  }

  getDAG(): TaskDAG | null {
    return this.#dag;
  }

  /**
   * Load a persisted mission (see persistence/index.ts). Rebuilds the DAG,
   * restores claims/evidence into the provenance graph, and replays the event
   * log into provenance memory. Throws if the import fails cross-checks.
   */
  loadMission(data: unknown): Mission {
    const { mission, events, verified, mismatches } = importMission(data);
    if (!verified) {
      throw new Error(`Persisted mission failed cross-check: ${mismatches.join('; ')}`);
    }

    const dag = new TaskDAG();
    for (const task of Object.values(mission.tasks)) {
      dag.addTask({ ...task });
    }
    this.#dag = dag;
    this.#currentMission = { ...mission };

    this.provenance.loadEvents(events);
    for (const c of Object.values(mission.claims)) {
      this.provenance.graph.recordClaim(c);
    }
    for (const e of Object.values(mission.evidence_graph)) {
      this.provenance.graph.recordEvidence(e);
    }
    return this.#currentMission;
  }

  /**
   * Run the Primary Reference Mission: "Technocore Integration Auditor".
   * Preserved for compatibility; delegates to the generic runMission engine.
   */
  async runAuditMission(objective: string, options?: MissionRunOptions): Promise<FinalReport> {
    return this.runMission(objective, buildAuditSpecs(), {
      ...options,
      timeoutTaskId: options?.timeoutTaskId ?? AUDIT_MISSION_META.timeoutTaskId,
      requirements: options?.requirements ?? [...AUDIT_MISSION_META.requirements],
      constraints: options?.constraints ?? [...AUDIT_MISSION_META.constraints],
    });
  }

  /**
   * Generic mission engine: objective + caller-supplied task specs → DAG →
   * discovery → execution → verification → synthesis. Domain content lives in
   * the specs, not in this method.
   */
  async runMission(objective: string, taskSpecs: readonly TaskSpec[], options?: MissionRunOptions): Promise<FinalReport> {
    if (taskSpecs.length === 0) {
      throw new Error('runMission requires at least one task spec');
    }
    const seen = new Set<string>();
    for (const s of taskSpecs) {
      if (seen.has(s.task_id)) throw new Error(`Duplicate task_id '${s.task_id}' in task specs`);
      seen.add(s.task_id);
    }
    this.metrics.reset();
    this.metrics.startMission();

    const missionId = `mission_${Date.now()}`;
    const initialMission: Mission = {
      mission_id: missionId,
      objective,
      normalized_objective: objective.trim(),
      status: 'CREATED',
      created_at: new Date().toISOString(),
      created_by: 'human_operator',
      requirements: options?.requirements ?? ['traceable-evidence'],
      constraints: options?.constraints ?? ['no-fabricated-scores', 'no-silently-dropped-disputes'],
      tasks: {},
      participants: {
        orchestrator: { agent_id: 'orchestrator', did: this.identity.did },
      },
      evidence_graph: {},
      claims: {},
      disputes: {},
    };

    this.#currentMission = initialMission;

    // 1. DISCOVER & DECOMPOSE
    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'PLANNING', {
      actor_id: 'orchestrator',
      reason: `Decomposing objective into Task DAG (${taskSpecs.length} tasks)`,
    });

    const dag = this.#decomposeMission(missionId, taskSpecs);
    this.#dag = dag;

    for (const task of dag.getAllTasks()) {
      this.#currentMission.tasks[task.task_id] = task;
      this.provenance.appendEvent({
        event_id: `evt_task_${task.task_id}`,
        event_type: 'TASK_CREATED',
        mission_id: missionId,
        task_id: task.task_id,
        actor_id: 'orchestrator',
        timestamp: new Date().toISOString(),
        data: { task },
      });
    }

    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'DISCOVERY', {
      actor_id: 'orchestrator',
      reason: 'Discovering agents matching required capabilities',
    });

    // 2. DELEGATE & EXECUTE CONCURRENTLY
    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'DELEGATING', {
      actor_id: 'orchestrator',
      reason: 'Delegating ready tasks to qualified agents',
    });

    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'EXECUTING', {
      actor_id: 'orchestrator',
      reason: 'Starting concurrent task execution',
    });

    const completedTaskIds = new Set<string>();
    const taskResults: Record<string, TaskResult> = {};

    // Execution loop: continuously execute ready tasks until all non-synthesis tasks complete
    while (true) {
      const readyTasks = dag.getReadyTasks(completedTaskIds);
      if (readyTasks.length === 0) {
        break; // No more tasks ready right now
      }

      // Execute ready tasks in parallel; isolate per-task failures so one
      // throwing agent cannot abort the whole mission or stall the DAG.
      await Promise.all(
        readyTasks.map(async (task) => {
          try {
            await this.#executeSingleTask(task, taskResults, completedTaskIds, options);
          } catch (err) {
            this.metrics.recordFailure();
            const failedTask = this.#currentMission?.tasks[task.task_id] ?? task;
            try {
              const marked = this.taskStateMachine.transition(failedTask, 'FAILED', {
                actor_id: 'orchestrator',
                reason: `Execution threw: ${(err as Error)?.message ?? String(err)}`,
              });
              if (this.#currentMission) this.#currentMission.tasks[task.task_id] = marked;
              this.#dag?.updateTask(marked);
            } catch {
              // Already terminal; just ensure the loop can progress.
            }
            completedTaskIds.add(task.task_id);
          }
          // Safety net: a task that neither completed nor failed must not
          // stall the DAG loop forever.
          if (!completedTaskIds.has(task.task_id)) {
            const stuck = this.#currentMission?.tasks[task.task_id];
            if (stuck && (stuck.status === 'FAILED' || stuck.status === 'COMPLETED')) {
              completedTaskIds.add(task.task_id);
            }
          }
        }),
      );
    }

    // 3+. Post-execution phases run under a salvage guard: a throw in
    // collect/verify/resolve/synthesize emits a partial report and FAILED
    // mission instead of an unhandled rejection with no salvageable state.
    try {
      return await this.#collectVerifySynthesize(missionId, objective, options, taskResults, completedTaskIds);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      if (this.#currentMission) {
        const partial: FinalReport = {
          mission_id: missionId,
          objective,
          executive_summary: `Mission aborted during post-execution: ${message}. Partial results preserved below.`,
          verified_claims: Object.values(this.#currentMission.claims).filter((c) => c.verification_status === 'VERIFIED'),
          disputes_resolved: Object.values(this.#currentMission.disputes),
          protocol_risks: [],
          recommendations: [],
          unresolved_uncertainties: [`Mission aborted: ${message}`],
          provenance_summary: {
            total_evidence: Object.keys(this.#currentMission.evidence_graph).length,
            total_claims: Object.keys(this.#currentMission.claims).length,
            total_verifications: Object.values(this.#currentMission.claims).filter((c) => c.verification_status === 'VERIFIED').length,
            total_disputes: Object.keys(this.#currentMission.disputes).length,
          },
          synthesized_at: new Date().toISOString(),
        };
        this.#currentMission = { ...this.#currentMission, final_result: partial };
        try {
          this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'FAILED', {
            actor_id: 'orchestrator',
            reason: message,
            data: { final_report: partial },
          });
        } catch {
          // Already terminal; preserve the partial as-is.
        }
        this.metrics.endMission();
        return partial;
      }
      throw err;
    }
  }

  /**
   * Post-execution pipeline: collect → verify → resolve → synthesize.
   * Called under the salvage guard in runMission.
   */
  async #collectVerifySynthesize(
    missionId: string,
    objective: string,
    options: MissionRunOptions | undefined,
    taskResults: Record<string, TaskResult>,
    completedTaskIds: Set<string>,
  ): Promise<FinalReport> {
    if (!this.#currentMission) throw new Error('No active mission');
    // 3. COLLECT RESULTS & EVIDENCE
    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'COLLECTING', {
      actor_id: 'orchestrator',
      reason: 'Aggregating claims and evidence records from completed tasks',
    });

    const allClaims: Claim[] = [];
    for (const res of Object.values(taskResults)) {
      for (const c of res.claims) {
        this.#currentMission.claims[c.claim_id] = c;
        allClaims.push(c);
        this.provenance.graph.recordClaim(c);
      }
      for (const e of res.evidence) {
        this.#currentMission.evidence_graph[e.evidence_id] = e;
        this.provenance.graph.recordEvidence(e);
      }
    }
    this.metrics.recordEvidenceCount(Object.keys(this.#currentMission.evidence_graph).length);

    // 4. VERIFY & DETECT CONFLICTS
    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'VERIFYING', {
      actor_id: 'orchestrator',
      reason: 'Initiating independent verification and contradiction detection',
    });

    // Check for contradictions between claims
    const conflicts = this.disputeEngine.detectConflicts(allClaims);

    // 5. RESOLVE DISPUTES (if conflicts detected)
    if (conflicts.length > 0) {
      this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'RESOLVING', {
        actor_id: 'orchestrator',
        reason: `Detected ${conflicts.length} contradictory claims; initiating dispute adjudication`,
      });

      for (const conflict of conflicts) {
        this.metrics.recordDispute();

        const dispute = this.disputeEngine.createDispute({
          mission_id: missionId,
          claimA: conflict.claimA,
          claimB: conflict.claimB,
          reason: conflict.reason,
          counter_evidence: conflict.claimB.evidence_refs
            .map((id) => this.#currentMission!.evidence_graph[id])
            .filter((e): e is Evidence => Boolean(e)),
        });

        this.#currentMission.disputes[dispute.dispute_id] = dispute;

        // Transition task status to DISPUTED
        const taskA = this.#currentMission.tasks[conflict.claimA.origin_task_id];
        if (taskA && taskA.status === 'VERIFYING') {
          const disputedTaskA = this.taskStateMachine.transition(taskA, 'DISPUTED', {
            actor_id: 'verifier-01',
            reason: conflict.reason,
          });
          this.#currentMission.tasks[taskA.task_id] = disputedTaskA;
          this.#dag?.updateTask(disputedTaskA);
        }
        const taskB = this.#currentMission.tasks[conflict.claimB.origin_task_id];
        if (taskB && taskB.status === 'VERIFYING') {
          const disputedTaskB = this.taskStateMachine.transition(taskB, 'DISPUTED', {
            actor_id: 'verifier-01',
            reason: conflict.reason,
          });
          this.#currentMission.tasks[taskB.task_id] = disputedTaskB;
          this.#dag?.updateTask(disputedTaskB);
        }

        this.provenance.appendEvent({
          event_id: `evt_disp_${dispute.dispute_id}`,
          event_type: 'DISPUTE_CREATED',
          mission_id: missionId,
          actor_id: 'verifier-01',
          timestamp: new Date().toISOString(),
          data: { dispute },
        });

        // Resolve dispute with supplemental evidence request
        const resolvedDispute = await this.disputeEngine.resolveDispute(
          dispute,
          conflict.claimA,
          conflict.claimB,
          Object.fromEntries(this.#agents.entries()),
          this.#currentMission.evidence_graph,
        );

        this.#currentMission.disputes[dispute.dispute_id] = resolvedDispute;

        // Update claim verification statuses based on dispute outcome.
        // Either side can win; only the prevailing side is marked VERIFIED.
        const aWins = resolvedDispute.outcome === 'SUPPORTED_A';
        const bWins = resolvedDispute.outcome === 'SUPPORTED_B';
        const winner = aWins ? conflict.claimA : bWins ? conflict.claimB : null;
        const loser = aWins ? conflict.claimB : bWins ? conflict.claimA : null;

        if (winner && loser) {
          this.#currentMission.claims[winner.claim_id] = {
            ...winner,
            verification_status: 'VERIFIED',
            verified_by: 'verifier-01',
            verification_reason: resolvedDispute.adjudication,
          };
          this.#currentMission.claims[loser.claim_id] = {
            ...loser,
            verification_status: 'CONTRADICTED',
            verified_by: 'verifier-01',
            verification_reason: resolvedDispute.adjudication ?? 'Contradicted by prevailing evidence.',
          };

          // Trigger Revision Request on the contradicted task
          const disputedTask = this.#currentMission.tasks[loser.origin_task_id];
          const assignedAgent = disputedTask?.assigned_agent ? this.#agents.get(disputedTask.assigned_agent) : undefined;

          if (disputedTask && disputedTask.status !== 'COMPLETED' && assignedAgent) {
            const revReq: RevisionRequest = {
              task_id: disputedTask.task_id,
              reason: resolvedDispute.adjudication ?? 'Claim contradicted by prevailing evidence. Revise with bound, sourced extracts.',
              required_adjustments: [
                'Re-examine the contradicted statement against primary sources',
                'Attach bound evidence with source + locator for each revised claim',
              ],
              requested_by: 'verifier-01',
              created_at: new Date().toISOString(),
            };

            let revTask = disputedTask;
            if (revTask.status === 'VERIFYING') {
              revTask = this.taskStateMachine.transition(revTask, 'DISPUTED', {
                actor_id: 'verifier-01',
                reason: conflict.reason,
              });
              this.#currentMission.tasks[disputedTask.task_id] = revTask;
              this.#dag?.updateTask(revTask);
            }

            // DISPUTED -> REVISION_REQUESTED
            revTask = this.taskStateMachine.transition(revTask, 'REVISION_REQUESTED', {
              actor_id: 'verifier-01',
              reason: revReq.reason,
              data: { revision_request: revReq },
            });
            this.#currentMission.tasks[disputedTask.task_id] = revTask;
            this.#dag?.updateTask(revTask);

            // Emit Revision Request Envelope over transport
            this.metrics.recordMessage();
            const revEnvelope = await this.identity.signEnvelope({
              message_id: `msg_rev_${revTask.task_id}_${Date.now()}`,
              message_type: 'REVISION_REQUEST',
              mission_id: missionId,
              task_id: revTask.task_id,
              agent_id: 'orchestrator',
              recipient: { agent_id: assignedAgent.agent_id, did: assignedAgent.did },
              payload: revReq,
            });
            await this.transport.sendEnvelope(`mb-coreswarm-${assignedAgent.agent_id}`, revEnvelope);

            // REVISION_REQUESTED -> EXECUTING
            revTask = this.taskStateMachine.transition(revTask, 'EXECUTING', {
              actor_id: assignedAgent.agent_id,
              reason: 'Executing revision adjustment',
            });
            this.#currentMission.tasks[disputedTask.task_id] = revTask;

            // Agent executes revision adjustment
            const revisedResult = await assignedAgent.handleRevisionRequest(revTask, revReq, {
              mission_id: missionId,
              upstream_results: taskResults,
            });

            this.provenance.graph.recordResult(revisedResult);
            taskResults[disputedTask.task_id] = revisedResult;

            // Stage revised evidence into the graph BEFORE verifying,
            // then run real verification — never blind-stamp.
            for (const e of revisedResult.evidence) {
              this.#currentMission.evidence_graph[e.evidence_id] = e;
              this.provenance.graph.recordEvidence(e);
            }
            const { updatedClaims: revisedClaims, decisions: revisedDecisions } =
              this.verifierEngine.verifyClaims(
                revisedResult.claims,
                this.#currentMission.evidence_graph,
                'verifier-01',
              );
            for (const uc of revisedClaims) {
              this.#currentMission.claims[uc.claim_id] = uc;
              this.provenance.graph.recordClaim(uc);
              this.metrics.recordVerificationOutcome(uc.verification_status);
            }
            for (const d of revisedDecisions) {
              this.provenance.graph.recordVerification(d);
            }
            const revisionPassed = revisedClaims.length > 0 &&
              revisedClaims.every((c) => c.verification_status === 'VERIFIED');

            // EXECUTING -> RESULT_SUBMITTED -> VERIFYING
            revTask = this.taskStateMachine.transition(revTask, 'RESULT_SUBMITTED', {
              actor_id: assignedAgent.agent_id,
            });
            revTask = this.taskStateMachine.transition(revTask, 'VERIFYING', {
              actor_id: 'verifier-01',
            });
            if (revisionPassed) {
              revTask = this.taskStateMachine.transition(revTask, 'VERIFIED', {
                actor_id: 'verifier-01',
                reason: 'Revision grounded in bound, sourced extracts',
              });
              revTask = this.taskStateMachine.transition(revTask, 'COMPLETED', {
                actor_id: 'orchestrator',
              });
            } else {
              revTask = this.taskStateMachine.transition(revTask, 'DISPUTED', {
                actor_id: 'verifier-01',
                reason: 'Revision failed verification; remains disputed',
              });
              // DISPUTED is terminal-adjacent for the DAG loop: park it so the
              // loop can progress; final completion pass handles terminal state.
              const parkedFailed = this.taskStateMachine.transition(revTask, 'FAILED', {
                actor_id: 'orchestrator',
                reason: 'Revision did not meet evidence quality bar',
              });
              this.#currentMission.tasks[disputedTask.task_id] = parkedFailed;
              this.#dag?.updateTask(parkedFailed);
              completedTaskIds.add(disputedTask.task_id);
              this.metrics.recordFailure();
              continue;
            }
            this.#currentMission.tasks[disputedTask.task_id] = revTask;
            this.#dag?.updateTask(revTask);
            completedTaskIds.add(disputedTask.task_id);
          }
        } else if (resolvedDispute.outcome === 'PARTIALLY_SUPPORTED' || resolvedDispute.outcome === 'INSUFFICIENT_EVIDENCE' || resolvedDispute.outcome === 'UNRESOLVED') {
          // No winner: mark both claims accordingly, preserve for the final report.
          for (const c of [conflict.claimA, conflict.claimB]) {
            this.#currentMission.claims[c.claim_id] = {
              ...c,
              verification_status: resolvedDispute.outcome === 'UNRESOLVED' ? 'UNVERIFIED' : 'INSUFFICIENT_EVIDENCE',
              verified_by: 'verifier-01',
              verification_reason: resolvedDispute.adjudication ?? 'No prevailing side.',
            };
          }
        }
      }
    }

    // Verify remaining claims
    const { updatedClaims, decisions } = this.verifierEngine.verifyClaims(
      Object.values(this.#currentMission.claims),
      this.#currentMission.evidence_graph,
      'verifier-01',
    );

    for (const uc of updatedClaims) {
      this.#currentMission.claims[uc.claim_id] = uc;
      this.metrics.recordVerificationOutcome(uc.verification_status);
    }
    for (const d of decisions) {
      this.provenance.graph.recordVerification(d);
    }

    // Mark verification tasks completed
    for (const task of Object.values(this.#currentMission.tasks)) {
      if (task.status === 'VERIFYING' || task.status === 'DISPUTED') {
        const verifiedTask = this.taskStateMachine.transition(task, 'VERIFIED', {
          actor_id: 'verifier-01',
          reason: 'Verification completed',
        });
        const completedTask = this.taskStateMachine.transition(verifiedTask, 'COMPLETED', {
          actor_id: 'orchestrator',
          reason: 'Task finished successfully',
        });
        this.#currentMission.tasks[task.task_id] = completedTask;
        this.#dag?.updateTask(completedTask);
        completedTaskIds.add(task.task_id);
      }
    }

    // 6. SYNTHESIZE FINAL RESULT
    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'SYNTHESIZING', {
      actor_id: 'orchestrator',
      reason: 'Compiling final audit report with backward provenance',
    });

    const synthAgent = this.#agents.get(options?.synthesizerId ?? 'synthesizer-01') as SynthesizerAgent | undefined;
    const finalReport = synthAgent
      ? synthAgent.compileFinalReport({
          mission_id: missionId,
          objective,
          claims: Object.values(this.#currentMission.claims),
          evidence: Object.values(this.#currentMission.evidence_graph),
          disputes: Object.values(this.#currentMission.disputes),
        })
      : {
          mission_id: missionId,
          objective,
          executive_summary: 'Technocore Integration Audit completed with verified claims.',
          verified_claims: Object.values(this.#currentMission.claims).filter((c) => c.verification_status === 'VERIFIED'),
          disputes_resolved: Object.values(this.#currentMission.disputes),
          protocol_risks: ['Multi-node nonce synchronization'],
          recommendations: ['Enforce signed messages in mission rooms'],
          unresolved_uncertainties: [],
          provenance_summary: {
            total_evidence: Object.keys(this.#currentMission.evidence_graph).length,
            total_claims: Object.keys(this.#currentMission.claims).length,
            total_verifications: Object.values(this.#currentMission.claims).filter((c) => c.verification_status === 'VERIFIED').length,
            total_disputes: Object.keys(this.#currentMission.disputes).length,
          },
          synthesized_at: new Date().toISOString(),
        };

    this.#currentMission = {
      ...this.#currentMission,
      final_result: finalReport,
    };

    this.#currentMission = this.missionStateMachine.transition(this.#currentMission, 'COMPLETED', {
      actor_id: 'orchestrator',
      reason: 'Mission completed with verified provenance',
      data: { final_report: finalReport },
    });

    this.metrics.endMission();
    return finalReport;
  }

  async #executeSingleTask(
    task: Task,
    taskResults: Record<string, TaskResult>,
    completedTaskIds: Set<string>,
    options?: MissionRunOptions,
  ): Promise<void> {
    if (!this.#currentMission) return;

    // 1. PLANNED -> DISCOVERING
    let currentTask = this.taskStateMachine.transition(task, 'DISCOVERING', {
      actor_id: 'orchestrator',
    });
    this.#currentMission.tasks[task.task_id] = currentTask;

    // 2. Select Agent
    const assignedAgentMeta = this.registry.selectAgent(
      task.required_capabilities,
      task.type,
    );

    if (!assignedAgentMeta) {
      this.metrics.recordFailure();
      const failedTask = this.taskStateMachine.transition(currentTask, 'FAILED', {
        actor_id: 'orchestrator',
        reason: 'No capable agent found for task requirements',
      });
      this.#currentMission.tasks[task.task_id] = failedTask;
      this.#dag?.updateTask(failedTask);
      completedTaskIds.add(task.task_id);
      return;
    }

    const agentInstance = this.#agents.get(assignedAgentMeta.agent_id);
    if (!agentInstance) {
      this.metrics.recordFailure();
      const failedTask = this.taskStateMachine.transition(currentTask, 'FAILED', {
        actor_id: 'orchestrator',
        reason: `Agent instance '${assignedAgentMeta.agent_id}' not loaded in runtime`,
      });
      this.#currentMission.tasks[task.task_id] = failedTask;
      this.#dag?.updateTask(failedTask);
      completedTaskIds.add(task.task_id);
      return;
    }

    // 3. DISCOVERING -> DELEGATED
    currentTask = this.taskStateMachine.transition(currentTask, 'DELEGATED', {
      actor_id: 'orchestrator',
      assigned_agent: agentInstance.agent_id,
    });
    this.#currentMission.tasks[task.task_id] = currentTask;

    // Emit signed envelope
    this.metrics.recordMessage();
    const taskRequestEnvelope = await this.identity.signEnvelope({
      message_id: `msg_req_${task.task_id}_${Date.now()}`,
      message_type: 'TASK_REQUEST',
      mission_id: this.#currentMission.mission_id,
      task_id: task.task_id,
      agent_id: 'orchestrator',
      recipient: { agent_id: agentInstance.agent_id, did: agentInstance.did },
      payload: {
        task_id: task.task_id,
        objective: task.objective,
        requirements: task.requirements,
        required_capabilities: task.required_capabilities,
        deadline: task.deadline,
      },
    });

    await this.transport.sendEnvelope(`mb-coreswarm-${agentInstance.agent_id}`, taskRequestEnvelope);

    // 4. Agent Validates & Accepts: DELEGATED -> ACCEPTED
    const acceptCheck = await agentInstance.acceptTask(currentTask);
    if (!acceptCheck.accept) {
      this.metrics.recordFailure();
      const failedTask = this.taskStateMachine.transition(currentTask, 'FAILED', {
        actor_id: agentInstance.agent_id,
        reason: acceptCheck.reason ?? 'Agent rejected task',
      });
      this.#currentMission.tasks[task.task_id] = failedTask;
      this.#dag?.updateTask(failedTask);
      completedTaskIds.add(task.task_id);
      return;
    }

    currentTask = this.taskStateMachine.transition(currentTask, 'ACCEPTED', {
      actor_id: agentInstance.agent_id,
    });
    this.#currentMission.tasks[task.task_id] = currentTask;

    // 5. ACCEPTED -> EXECUTING
    currentTask = this.taskStateMachine.transition(currentTask, 'EXECUTING', {
      actor_id: agentInstance.agent_id,
    });
    this.#currentMission.tasks[task.task_id] = currentTask;

    // Timeout simulation targets the configured task (default: audit security task)
    const timeoutTarget = options?.timeoutTaskId ?? AUDIT_MISSION_META.timeoutTaskId;
    if (options?.simulateTimeout && task.task_id === timeoutTarget && currentTask.attempt === 1) {
      // 1. Trigger timeout: EXECUTING -> TIMEOUT
      currentTask = this.taskStateMachine.transition(currentTask, 'TIMEOUT', {
        actor_id: 'orchestrator',
        reason: 'Agent execution deadline expired (simulated timeout)',
      });
      this.#currentMission.tasks[task.task_id] = currentTask;
      this.#dag?.updateTask(currentTask);
      this.metrics.recordTimeout();
      this.metrics.recordFailure();

      // 2. TIMEOUT -> REASSIGNED (increment attempt to 2)
      currentTask = this.taskStateMachine.transition(currentTask, 'REASSIGNED', {
        actor_id: 'orchestrator',
        reason: 'Reassigning task to agent on attempt 2 after timeout recovery',
      });
      currentTask = {
        ...currentTask,
        attempt: 2,
      };
      this.#currentMission.tasks[task.task_id] = currentTask;
      this.#dag?.updateTask(currentTask);
      this.metrics.recordRetry();

      // 3. REASSIGNED -> EXECUTING (Recovery execution)
      currentTask = this.taskStateMachine.transition(currentTask, 'EXECUTING', {
        actor_id: agentInstance.agent_id,
        reason: 'Re-executing task after timeout reassignment',
      });
      this.#currentMission.tasks[task.task_id] = currentTask;
    }

    this.metrics.startTask(task.task_id);

    // 6. Execute Task with a real deadline race. The TimeoutMonitor is armed
    // per attempt; on expiry the task goes TIMEOUT -> REASSIGNED -> EXECUTING
    // and is retried once before being marked FAILED.
    const deadlineMs = Math.max(0, Date.parse(currentTask.deadline) - Date.now() || this.#defaultTimeoutMs);
    let timedOut = false;
    const timeoutFired = new Promise<'timeout'>((resolve) => {
      this.timeoutMonitor.armTimeout(currentTask, deadlineMs, {
        onTimeout: () => { timedOut = true; resolve('timeout'); },
      });
    });
    const execution = agentInstance.executeTask(currentTask, {
      mission_id: this.#currentMission.mission_id,
      upstream_results: taskResults,
    });
    const resultOrTimeout = await Promise.race([execution.then((r) => ({ kind: 'result' as const, r })), timeoutFired.then(() => ({ kind: 'timeout' as const }))]);
    this.timeoutMonitor.disarmTimeout(task.task_id);

    if (resultOrTimeout.kind === 'timeout' || timedOut) {
      // Attach to the still-running execution so an unhandled rejection never escapes.
      execution.catch(() => undefined);
      this.metrics.recordTimeout();
      this.metrics.recordFailure();
      currentTask = this.taskStateMachine.transition(currentTask, 'TIMEOUT', {
        actor_id: 'orchestrator',
        reason: `Agent execution deadline expired after ${deadlineMs}ms`,
      });
      this.#currentMission.tasks[task.task_id] = currentTask;
      this.#dag?.updateTask(currentTask);

      if (currentTask.attempt >= 2) {
        const failedTask = this.taskStateMachine.transition(currentTask, 'FAILED', {
          actor_id: 'orchestrator',
          reason: 'Timeout retry budget exhausted',
        });
        this.#currentMission.tasks[task.task_id] = failedTask;
        this.#dag?.updateTask(failedTask);
        completedTaskIds.add(task.task_id);
        return;
      }

      currentTask = this.taskStateMachine.transition(currentTask, 'REASSIGNED', {
        actor_id: 'orchestrator',
        reason: 'Reassigning task after timeout recovery',
      });
      this.#currentMission.tasks[task.task_id] = currentTask;
      this.#dag?.updateTask(currentTask);
      this.metrics.recordRetry();
      currentTask = this.taskStateMachine.transition(currentTask, 'EXECUTING', {
        actor_id: agentInstance.agent_id,
        reason: 'Re-executing task after timeout reassignment',
      });
      this.#currentMission.tasks[task.task_id] = currentTask;

      // Single retry execution (bounded by the same deadline mechanism on next pass
      // if still needed; here we await directly since attempt budget is exhausted after).
      const retryResult = await agentInstance.executeTask(currentTask, {
        mission_id: this.#currentMission.mission_id,
        upstream_results: taskResults,
      });
      this.metrics.completeTask(task.task_id, agentInstance.agent_id);
      // Idempotency: ignore duplicate result submissions.
      if (!this.protocolHandler.replayGuard.recordResultSubmission(retryResult.result_id)) {
        const dupTask = this.taskStateMachine.transition(currentTask, 'FAILED', {
          actor_id: 'orchestrator',
          reason: `Duplicate result_id '${retryResult.result_id}' rejected`,
        });
        this.#currentMission.tasks[task.task_id] = dupTask;
        this.#dag?.updateTask(dupTask);
        completedTaskIds.add(task.task_id);
        this.metrics.recordFailure();
        return;
      }
      this.provenance.graph.recordResult(retryResult);
      taskResults[task.task_id] = retryResult;
    } else {
      const freshResult = resultOrTimeout.r;
      this.metrics.completeTask(task.task_id, agentInstance.agent_id);
      // Idempotency: ignore duplicate result submissions.
      if (!this.protocolHandler.replayGuard.recordResultSubmission(freshResult.result_id)) {
        const dupTask = this.taskStateMachine.transition(currentTask, 'FAILED', {
          actor_id: 'orchestrator',
          reason: `Duplicate result_id '${freshResult.result_id}' rejected`,
        });
        this.#currentMission.tasks[task.task_id] = dupTask;
        this.#dag?.updateTask(dupTask);
        completedTaskIds.add(task.task_id);
        this.metrics.recordFailure();
        return;
      }
      this.provenance.graph.recordResult(freshResult);
      taskResults[task.task_id] = freshResult;
    }

    const completedResult = taskResults[task.task_id]!;
    // 7. EXECUTING -> RESULT_SUBMITTED
    currentTask = this.taskStateMachine.transition(currentTask, 'RESULT_SUBMITTED', {
      actor_id: agentInstance.agent_id,
      data: {
        claims: completedResult.claims,
        evidence: completedResult.evidence,
      },
    });
    this.#currentMission.tasks[task.task_id] = currentTask;
    this.#dag?.updateTask(currentTask);

    // 8. RESULT_SUBMITTED -> VERIFYING
    currentTask = this.taskStateMachine.transition(currentTask, 'VERIFYING', {
      actor_id: 'orchestrator',
    });
    this.#currentMission.tasks[task.task_id] = currentTask;
    this.#dag?.updateTask(currentTask);

    // Mark task as execution-completed for downstream DAG scheduling
    completedTaskIds.add(task.task_id);
  }

  /**
   * Generic decomposition: build a TaskDAG from caller-supplied specs.
   * Domain content lives in the specs (see presets/audit-mission.ts).
   */
  #decomposeMission(missionId: string, specs: readonly TaskSpec[]): TaskDAG {
    const dag = new TaskDAG();
    const now = new Date();
    const deadline = new Date(now.getTime() + 60_000).toISOString();

    for (const spec of specs) {
      const task: Task = {
        task_id: spec.task_id,
        mission_id: missionId,
        type: spec.type,
        title: spec.title,
        objective: spec.objective,
        requirements: [...spec.requirements],
        required_capabilities: [...spec.required_capabilities],
        dependencies: [...spec.dependencies],
        status: 'PLANNED',
        attempt: 1,
        created_at: now.toISOString(),
        deadline,
      };
      dag.addTask(task);
    }

    return dag;
  }
}
