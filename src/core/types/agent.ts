/**
 * CoreSwarm Agent Registry Types
 *
 * Exposes discoverable metadata and advertised capabilities.
 * Capabilities are metadata, not proof of competence.
 */

import type { TaskType } from './task';

export type AgentStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'FAULTED';

export interface AgentMetadata {
  readonly agent_id: string;
  readonly did: string; // did:key:z6Mk...
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly supported_task_types: readonly TaskType[];
  readonly supported_protocol_versions: readonly string[]; // e.g. ['coreswarm/1']
  readonly endpoint: string; // room name or HTTP endpoint
  readonly availability: AgentStatus;
  readonly metadata?: Record<string, unknown>;
}
