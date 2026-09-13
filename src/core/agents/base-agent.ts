/**
 * CoreSwarm Generic Agent Abstraction
 *
 * All autonomous agents (internal reference agents and external participants)
 * adhere to this lifecycle contract.
 */

import { Identity } from '../crypto/identity';
import type { Task, TaskResult } from '../types/task';
import type { AgentMetadata, AgentStatus } from '../types/agent';
import type { Evidence } from '../types/evidence';
import type { RevisionRequest } from '../types/verification';

export interface TaskExecutionContext {
  readonly mission_id: string;
  readonly shared_context?: Record<string, unknown>;
  readonly upstream_results?: Record<string, TaskResult>;
}

export abstract class BaseAgent {
  readonly agent_id: string;
  readonly identity: Identity;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly supported_task_types: readonly Task['type'][];
  status: AgentStatus = 'AVAILABLE';

  constructor(params: {
    agent_id: string;
    identity: Identity;
    name: string;
    description: string;
    capabilities: readonly string[];
    supported_task_types: readonly Task['type'][];
  }) {
    this.agent_id = params.agent_id;
    this.identity = params.identity;
    this.name = params.name;
    this.description = params.description;
    this.capabilities = params.capabilities;
    this.supported_task_types = params.supported_task_types;
  }

  get did(): string {
    return this.identity.did;
  }

  getMetadata(): AgentMetadata {
    return {
      agent_id: this.agent_id,
      did: this.did,
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      supported_task_types: this.supported_task_types,
      supported_protocol_versions: ['coreswarm/1'],
      endpoint: `mb-coreswarm-${this.agent_id}`,
      availability: this.status,
    };
  }

  /**
   * Validate whether the agent accepts or rejects a delegated task.
   */
  async acceptTask(task: Task): Promise<{ accept: boolean; reason?: string }> {
    if (this.status === 'OFFLINE' || this.status === 'FAULTED') {
      return { accept: false, reason: `Agent is currently ${this.status}` };
    }

    if (!this.supported_task_types.includes(task.type)) {
      return { accept: false, reason: `Task type '${task.type}' not supported by ${this.name}` };
    }

    const hasAllCaps = task.required_capabilities.every((c) => this.capabilities.includes(c));
    if (!hasAllCaps) {
      return { accept: false, reason: `Missing required capabilities: ${task.required_capabilities.filter((c) => !this.capabilities.includes(c)).join(', ')}` };
    }

    return { accept: true };
  }

  /**
   * Execute the accepted task and produce structured result with claims and evidence.
   */
  abstract executeTask(task: Task, context: TaskExecutionContext): Promise<TaskResult>;

  /**
   * Handle an explicit evidence request from another agent or verifier.
   */
  abstract handleEvidenceRequest(claim_id: string, reason: string): Promise<Evidence[]>;

  /**
   * Handle a revision request when a result is disputed or needs adjustments.
   */
  abstract handleRevisionRequest(
    task: Task,
    revision: RevisionRequest,
    context: TaskExecutionContext,
  ): Promise<TaskResult>;

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    this.status = 'OFFLINE';
  }
}
