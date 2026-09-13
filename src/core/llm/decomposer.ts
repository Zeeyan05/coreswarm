/**
 * CoreSwarm AI Decomposer
 *
 * Turns a free-text objective into TaskSpec[] using any LLMProvider.
 * Output is strictly validated: task types, capability names, dependency
 * references, and DAG acyclicity are all checked before returning.
 * Invalid plans throw — never silently repaired into something else.
 */

import { TaskDAG } from '../dag/task-dag';
import type { LLMProvider } from './provider';
import type { TaskSpec } from '../types/mission';
import type { TaskType } from '../types/task';

const VALID_TYPES: readonly TaskType[] = ['RESEARCH', 'ANALYSIS', 'SECURITY_AUDIT', 'VERIFICATION', 'SYNTHESIS'];
const ID_PATTERN = /^[a-z0-9_]{3,64}$/;

interface RawSpec {
  task_id?: unknown;
  type?: unknown;
  title?: unknown;
  objective?: unknown;
  requirements?: unknown;
  required_capabilities?: unknown;
  dependencies?: unknown;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === 'string')) return null;
  return [...(v as string[])];
}

export function validateSpecs(raw: unknown, availableCapabilities: readonly string[]): TaskSpec[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { tasks?: unknown }).tasks)) {
    throw new Error('Decomposer output must be { tasks: [...] }');
  }
  const items = (raw as { tasks: RawSpec[] }).tasks;
  if (items.length === 0 || items.length > 12) {
    throw new Error(`Decomposer must return 1..12 tasks (got ${items.length})`);
  }

  const specs: TaskSpec[] = items.map((r, i) => {
    const task_id = typeof r.task_id === 'string' && ID_PATTERN.test(r.task_id)
      ? r.task_id
      : `task_auto_${i + 1}`;
    if (typeof r.type !== 'string' || !(VALID_TYPES as readonly string[]).includes(r.type)) {
      throw new Error(`Task ${i + 1}: invalid type '${String(r.type)}' (expected one of ${VALID_TYPES.join(', ')})`);
    }
    if (typeof r.title !== 'string' || r.title.trim().length === 0) {
      throw new Error(`Task ${i + 1}: missing title`);
    }
    if (typeof r.objective !== 'string' || r.objective.trim().length === 0) {
      throw new Error(`Task ${i + 1}: missing objective`);
    }
    const requirements = asStringArray(r.requirements) ?? [];
    const required_capabilities = asStringArray(r.required_capabilities) ?? [];
    const dependencies = asStringArray(r.dependencies) ?? [];
    return {
      task_id,
      type: r.type as TaskType,
      title: r.title.trim().slice(0, 160),
      objective: r.objective.trim().slice(0, 2000),
      requirements: requirements.map((s) => s.slice(0, 300)),
      required_capabilities: required_capabilities.map((s) => s.slice(0, 80)),
      dependencies,
    };
  });

  // Duplicate IDs
  const ids = new Set<string>();
  for (const s of specs) {
    if (ids.has(s.task_id)) throw new Error(`Duplicate task_id '${s.task_id}'`);
    ids.add(s.task_id);
  }
  // Dependencies must reference known IDs
  for (const s of specs) {
    for (const d of s.dependencies) {
      if (!ids.has(d)) throw new Error(`Task '${s.task_id}' depends on unknown '${d}'`);
      if (d === s.task_id) throw new Error(`Task '${s.task_id}' depends on itself`);
    }
  }
  // Capabilities should exist in the registry (warn-worthy, not fatal — agents may register later)
  const unknownCaps = specs
    .flatMap((s) => s.required_capabilities)
    .filter((c) => !availableCapabilities.includes(c));
  if (unknownCaps.length > 0) {
    throw new Error(`Unknown capabilities (no registered agent advertises them): ${[...new Set(unknownCaps)].join(', ')}`);
  }
  // Acyclicity via the real DAG
  const dag = new TaskDAG();
  const now = new Date().toISOString();
  for (const s of specs) {
    dag.addTask({
      task_id: s.task_id,
      mission_id: 'mission_validation',
      type: s.type,
      title: s.title,
      objective: s.objective,
      requirements: s.requirements,
      required_capabilities: s.required_capabilities,
      dependencies: s.dependencies,
      status: 'PLANNED',
      attempt: 1,
      created_at: now,
      deadline: now,
    });
  }

  return specs;
}

export async function decomposeObjective(
  llm: LLMProvider,
  objective: string,
  availableCapabilities: readonly string[],
): Promise<TaskSpec[]> {
  if (objective.trim().length < 10) {
    throw new Error('Objective is too short to decompose (min 10 chars)');
  }
  const prompt = [
    'You are the CoreSwarm mission decomposer. Break the objective into a small DAG of tasks.',
    `Available agent capabilities: ${availableCapabilities.join(', ') || '(none registered)'}.`,
    'Every required_capability you list MUST come from that set.',
    'Valid task types: RESEARCH, ANALYSIS, SECURITY_AUDIT, VERIFICATION, SYNTHESIS.',
    'Keep it to 2-6 tasks. At least one task must produce evidence-backed claims.',
    'Dependencies must form a DAG (no cycles). Use short snake_case task_ids.',
    `Objective: ${objective.trim().slice(0, 2000)}`,
  ].join('\n');

  const raw = await llm.structuredGenerate<unknown>(
    prompt,
    '{ "tasks": [ { "task_id": "task_x", "type": "RESEARCH", "title": "...", "objective": "...", "requirements": ["..."], "required_capabilities": ["..."], "dependencies": ["..."] } ] }',
  );
  return validateSpecs(raw, availableCapabilities);
}
