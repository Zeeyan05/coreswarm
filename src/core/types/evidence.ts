/**
 * CoreSwarm Evidence Model
 *
 * Evidence grounds claims in verifiable sources (source code, API docs, logs, network traces).
 * External evidence is always treated as untrusted data.
 */

export interface Evidence {
  readonly evidence_id: string; // ev_...
  readonly claim_id: string;
  readonly source: string; // File path, URL, specification section
  readonly locator: string; // Line numbers (e.g. L14-L28), JSON path, or hash
  readonly extract: string; // The verifiable raw text / code extract
  readonly collected_by: string; // Agent ID
  readonly collected_at: string; // ISO 8601 timestamp
  readonly untrusted: true; // Untrusted external data boundary flag
}
