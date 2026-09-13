/**
 * CoreSwarm Mission Model
 */

import type { Task, TaskType } from './task';
import type { Claim } from './claims';
import type { Evidence } from './evidence';
import type { Dispute } from './verification';
import type { ParticipantIdentity } from './protocol';

/**
 * Generic task specification for runMission: describes WHAT to do without
 * hardcoding any domain. The audit preset builds these; callers can supply
 * their own for arbitrary missions (summarization, research, analysis...).
 */
export interface TaskSpec {
  readonly task_id: string;
  readonly type: TaskType;
  readonly title: string;
  readonly objective: string;
  readonly requirements: readonly string[];
  readonly required_capabilities: readonly string[];
  readonly dependencies: readonly string[];
}

export type MissionStatus =
  | 'CREATED'
  | 'PLANNING'
  | 'DISCOVERY'
  | 'DELEGATING'
  | 'EXECUTING'
  | 'COLLECTING'
  | 'VERIFYING'
  | 'RESOLVING'
  | 'SYNTHESIZING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export interface FinalReport {
  readonly mission_id: string;
  readonly objective: string;
  readonly executive_summary: string;
  readonly verified_claims: readonly Claim[];
  readonly disputes_resolved: readonly Dispute[];
  readonly protocol_risks: readonly string[];
  readonly recommendations: readonly string[];
  readonly unresolved_uncertainties: readonly string[];
  readonly provenance_summary: {
    readonly total_evidence: number;
    readonly total_claims: number;
    readonly total_verifications: number;
    readonly total_disputes: number;
  };
  readonly synthesized_at: string;
}

export interface Mission {
  readonly mission_id: string; // mission_...
  readonly objective: string;
  readonly normalized_objective: string;
  readonly status: MissionStatus;
  readonly created_at: string;
  readonly created_by: string;
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
  readonly tasks: Record<string, Task>;
  readonly participants: Record<string, ParticipantIdentity>;
  readonly evidence_graph: Record<string, Evidence>;
  readonly claims: Record<string, Claim>;
  readonly disputes: Record<string, Dispute>;
  readonly final_result?: FinalReport;
}
