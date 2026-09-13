/**
 * CoreSwarm Mission Persistence
 *
 * Export/import missions as portable JSON: mission record + event log +
 * nonce watermark. Import replays events through MissionReplayEngine to
 * rebuild state without trusting the snapshot (snapshot is cross-checked).
 */

import { MissionReplayEngine } from '../replay/mission-replay';
import type { Mission } from '../types/mission';
import type { CoreSwarmEvent } from '../types/events';

export interface PersistedMission {
  readonly format: 'coreswarm-mission/1';
  readonly exported_at: string;
  readonly mission: Mission;
  readonly events: readonly CoreSwarmEvent[];
  readonly nonceWatermark?: string;
}

export function exportMission(
  mission: Mission,
  events: readonly CoreSwarmEvent[],
  nonceWatermark?: string,
): PersistedMission {
  return {
    format: 'coreswarm-mission/1',
    exported_at: new Date().toISOString(),
    mission: JSON.parse(JSON.stringify(mission)) as Mission,
    events: JSON.parse(JSON.stringify(events)) as CoreSwarmEvent[],
    nonceWatermark,
  };
}

export function importMission(data: unknown): {
  mission: Mission;
  events: CoreSwarmEvent[];
  verified: boolean;
  mismatches: string[];
} {
  const mismatches: string[] = [];
  const d = data as Partial<PersistedMission>;

  if (!d || d.format !== 'coreswarm-mission/1') {
    throw new Error('Not a coreswarm-mission/1 export');
  }
  if (!d.mission || !Array.isArray(d.events)) {
    throw new Error('Export is missing mission or events');
  }

  // Rebuild state from the event log and cross-check against the snapshot.
  const engine = new MissionReplayEngine(d.events as CoreSwarmEvent[]);
  const rebuilt = engine.replayTo(d.events.length - 1);

  if (rebuilt.mission_id !== d.mission.mission_id && rebuilt.mission_id !== 'unknown') {
    mismatches.push(`mission_id: log=${rebuilt.mission_id} snapshot=${d.mission.mission_id}`);
  }
  if (rebuilt.status !== d.mission.status) {
    mismatches.push(`status: log=${rebuilt.status} snapshot=${d.mission.status}`);
  }
  const logTasks = Object.keys(rebuilt.tasks).sort().join(',');
  const snapTasks = Object.keys(d.mission.tasks).sort().join(',');
  if (logTasks !== snapTasks) {
    mismatches.push(`tasks: log=[${logTasks}] snapshot=[${snapTasks}]`);
  }
  const logClaims = Object.keys(rebuilt.claims).sort().join(',');
  const snapClaims = Object.keys(d.mission.claims).sort().join(',');
  if (logClaims !== snapClaims) {
    mismatches.push(`claims: log=[${logClaims}] snapshot=[${snapClaims}]`);
  }

  return {
    mission: d.mission as Mission,
    events: [...(d.events as CoreSwarmEvent[])],
    verified: mismatches.length === 0,
    mismatches,
  };
}
