/**
 * CoreSwarm Agent Registry
 *
 * Maintains discoverable agent metadata and advertises capabilities.
 * Implements deterministic capability matching without fabricated reputation scores.
 */

import type { AgentMetadata, AgentStatus } from '../types/agent';
import type { TaskType } from '../types/task';

export class AgentRegistry {
  readonly #agents = new Map<string, AgentMetadata>();

  /**
   * Register or update an agent's discoverable metadata.
   */
  register(metadata: AgentMetadata): void {
    this.#agents.set(metadata.agent_id, metadata);
  }

  /**
   * Retrieve an agent by ID.
   */
  get(agentId: string): AgentMetadata | undefined {
    return this.#agents.get(agentId);
  }

  /**
   * List all registered agents.
   */
  listAll(): AgentMetadata[] {
    return Array.from(this.#agents.values());
  }

  /**
   * Update an agent's availability status.
   */
  setStatus(agentId: string, status: AgentStatus): void {
    const agent = this.#agents.get(agentId);
    if (agent) {
      this.#agents.set(agentId, { ...agent, availability: status });
    }
  }

  /**
   * Deterministic capability matching.
   * Finds available agents satisfying all required capabilities and supporting the task type.
   *
   * @param requiredCapabilities - Capabilities required by the task
   * @param taskType - Task type (e.g. RESEARCH, ANALYSIS)
   * @param excludeAgentIds - Agents to exclude (e.g. previously timed out or failed agents)
   */
  findEligibleAgents(
    requiredCapabilities: readonly string[],
    taskType: TaskType,
    excludeAgentIds: readonly string[] = [],
  ): AgentMetadata[] {
    const excluded = new Set(excludeAgentIds);

    return Array.from(this.#agents.values())
      .filter((agent) => {
        if (excluded.has(agent.agent_id)) return false;
        if (agent.availability === 'OFFLINE' || agent.availability === 'FAULTED') return false;
        if (!agent.supported_task_types.includes(taskType)) return false;

        // Verify all required capabilities are advertised
        const agentCaps = new Set(agent.capabilities);
        return requiredCapabilities.every((req) => agentCaps.has(req));
      })
      .sort((a, b) => a.agent_id.localeCompare(b.agent_id)); // Deterministic order
  }

  /**
   * Select the best agent deterministically.
   */
  selectAgent(
    requiredCapabilities: readonly string[],
    taskType: TaskType,
    excludeAgentIds: readonly string[] = [],
  ): AgentMetadata | null {
    const eligible = this.findEligibleAgents(requiredCapabilities, taskType, excludeAgentIds);
    return eligible[0] ?? null;
  }
}
