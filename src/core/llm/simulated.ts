/**
 * CoreSwarm Simulated LLM Provider
 *
 * Provides deterministic, reproducible responses for tests and local zero-cost runs.
 * Capable of simulating:
 * - Successful analysis
 * - Protocol disagreements / disputes
 * - Evidence requests and responses
 * - Revisions
 */

import type { LLMProvider } from './provider';

export interface SimulationScenarioConfig {
  readonly simulateDispute?: boolean;
  readonly simulateTimeout?: boolean;
  readonly simulateFailure?: boolean;
}

export class SimulatedLLMProvider implements LLMProvider {
  config: SimulationScenarioConfig;

  constructor(config: SimulationScenarioConfig = {}) {
    this.config = config;
  }

  setScenarioConfig(config: SimulationScenarioConfig): void {
    this.config = { ...this.config, ...config };
  }

  async generate(prompt: string): Promise<string> {
    if (prompt.includes('SYNTHESIS')) {
      return 'The Technocore integration has been audited across cryptographic primitives, single-line sweeping, compare-and-set notes, and protocol risk vectors. All core protocol constraints are satisfied.';
    }
    return 'Analysis completed with verified evidence references.';
  }

  async structuredGenerate<T>(prompt: string, _schemaDescription: string): Promise<T> {
    const upper = prompt.toUpperCase();

    // 1. Verifier: independent evaluation
    if (upper.includes('INDEPENDENT VERIFIER') || upper.includes('VERIFIER EVALUATION') || upper.includes('VERIFIEROUTPUT')) {
      return {
        verified_claims: [
          {
            statement: 'Ed25519 DID generation adheres strictly to did:key:z6Mk format with multicodec prefix [0xed, 0x01] and 56-character length.',
            status: 'VERIFIED',
            reason: 'Empirically verified against multicodec spec and regex tests.',
          },
          {
            statement: 'Single-line Unicode sweep replaces all control and separator characters (Cc, Cf, Cs, Co, Zl, Zp) with a space and trims.',
            status: 'VERIFIED',
            reason: 'Conforms to official Technocore v0.11.1 protocol specification.',
          },
          {
            statement: 'Ed25519 86-char base64url signatures strictly validate terminal characters [AQgw] to prevent non-canonical encoding malleability.',
            status: 'VERIFIED',
            reason: 'Confirmed by SIG_PATTERN regex check in types/index.ts.',
          },
          {
            statement: 'Notes compare-and-set (CAS) operations properly recover the actual server value upon 409 conflict.',
            status: 'VERIFIED',
            reason: 'Confirmed by compareAndSwap error recovery in notes/index.ts.',
          },
          {
            statement: 'Concurrent agent instances operating without a shared lock could experience replay or ordering issues unless coordinated via /kv/room-nonce/<room>.',
            status: 'VERIFIED',
            reason: 'Valid architectural implication of client-side nonce generation without shared lock.',
          },
          {
            statement: 'Signature verification in secondary paths allows arbitrary base64url padding without validating terminal characters [AQgw].',
            status: 'CONTRADICTED',
            reason: 'Contradicted by SIG_PATTERN in types/index.ts which enforces [AQgw] terminal chars before rawVerify.',
          },
        ],
        dispute_recommendations: [
          'Request additional extract from Researcher demonstrating that SIG_PATTERN is checked prior to rawVerify.',
        ],
      } as unknown as T;
    }

    // 2. Security Analyst: Protocol risks and potential dispute
    if (upper.includes('ANALYST AGENT') || upper.includes('SECURITY_AUDIT') || upper.includes('ANALYSISRESULT')) {
      const claims: Array<{
        statement: string;
        type: string;
        confidence: number;
        evidence: Array<{ source: string; locator: string; extract: string }>;
      }> = [
        {
          statement: 'Notes compare-and-set (CAS) operations properly recover the actual server value upon 409 conflict.',
          type: 'OBSERVATION',
          confidence: 0.92,
          evidence: [
            {
              source: 'technocore-sdk/src/notes/index.ts',
              locator: 'lines 180-186',
              extract: 'if (err instanceof TechnocoreHTTPError && err.status === 409) { return { success: false, value: sweptValue, actualValue: this.#extractConflictValue(err.body) }; }',
            },
          ],
        },
        {
          statement: 'Concurrent agent instances operating without a shared lock could experience replay or ordering issues unless coordinated via /kv/room-nonce/<room>.',
          type: 'INFERENCE',
          confidence: 0.88,
          evidence: [
            {
              source: 'technocore-sdk/src/notes/index.ts',
              locator: 'lines 284-298',
              extract: 'return this.#withRoomLock(key, async () => { const nonce = await this.#getNextSignedNonce(namespace, key); ... });',
            },
          ],
        },
      ];

      // Check if this execution is a revision adjustment following dispute adjudication
      if (upper.includes('REVISION ADJUSTMENT') || upper.includes('REVISION REQUEST')) {
        claims.push({
          statement: 'Verified: SIG_PATTERN regex strictly enforces terminal characters [AQgw] before cryptographic verification, closing the potential padding vector.',
          type: 'FACT',
          confidence: 0.99,
          evidence: [
            {
              source: 'technocore-sdk/src/types/index.ts',
              locator: 'lines 18-28',
              extract: 'export const SIG_PATTERN = /^[A-Za-z0-9_-]{85}[AQgw]$/;',
            },
          ],
        });
      } else if (this.config.simulateDispute ?? true) {
        // If dispute simulation is enabled, inject a contentious claim that contradicts Researcher's Claim 3
        claims.push({
          statement: 'Signature verification in secondary paths allows arbitrary base64url padding without validating terminal characters [AQgw].',
          type: 'INFERENCE',
          confidence: 0.74,
          evidence: [
            {
              source: 'technocore-sdk/src/crypto/verify.ts',
              locator: 'lines 30-45',
              extract: 'rawVerify(sigBytes, payload, publicKey); // Security question: does rawVerify check terminal chars?',
            },
          ],
        });
      }

      return {
        summary: 'Completed security analysis of Technocore integration. Identified concurrency risk around nonces and questioned signature terminal validation in secondary paths.',
        claims,
        limitations: ['Evaluated without fuzzing edge-case unicode sequences.'],
      } as unknown as T;
    }

    // 3. Researcher: Single-Line Unicode Sweeping Audit
    if (upper.includes('SINGLE-LINE UNICODE') || upper.includes('UNICODE SWEEPING') || upper.includes('CATEGORIES CC')) {
      return {
        summary: 'Researched single-line Unicode sweeping behavior. Verified category regex and whitespace collapsing.',
        claims: [
          {
            statement: 'Single-line Unicode sweep replaces all control and separator characters (Cc, Cf, Cs, Co, Zl, Zp) with a space and trims.',
            type: 'FACT',
            confidence: 0.99,
            evidence: [
              {
                source: 'technocore-sdk/src/crypto/sweep.ts',
                locator: 'lines 28-41',
                extract: 'const SWEEP_PATTERN = /[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Co}\\p{Zl}\\p{Zp}]/gu;\nexport function sweep(text: string): string { return text.replace(SWEEP_PATTERN, " ").trim(); }',
              },
            ],
          },
          {
            statement: 'Consecutive swept control and separator characters collapse cleanly without protocol payload corruption.',
            type: 'FACT',
            confidence: 0.96,
            evidence: [
              {
                source: 'technocore-sdk/src/crypto/sweep.ts',
                locator: 'lines 42-48',
                extract: 'return text.replace(SWEEP_PATTERN, " ").replace(/\\s+/g, " ").trim();',
              },
            ],
          },
        ],
        limitations: [],
      } as unknown as T;
    }

    // 4. Researcher: Protocol & Crypto Primitives Audit
    if (upper.includes('RESEARCHER AGENT') || upper.includes('RESEARCHRESULT') || upper.includes('RESEARCH') || upper.includes('CRYPTO')) {
      const result = {
        summary: 'Researched Technocore protocol integration in codebase. Verified Ed25519 DID encoding and signature terminal characters.',
        claims: [
          {
            statement: 'Ed25519 DID generation adheres strictly to did:key:z6Mk format with multicodec prefix [0xed, 0x01] and 56-character length.',
            type: 'FACT',
            confidence: 0.98,
            evidence: [
              {
                source: 'technocore-sdk/src/crypto/did.ts',
                locator: 'lines 17-47',
                extract: 'const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);\nexport function didFromPublicKey(publicKey: Uint8Array): string { ... return `did:key:z${encoded}`; }',
              },
            ],
          },
          {
            statement: 'Ed25519 86-char base64url signatures strictly validate terminal characters [AQgw] to prevent non-canonical encoding malleability.',
            type: 'FACT',
            confidence: 0.95,
            evidence: [
              {
                source: 'technocore-sdk/src/types/index.ts',
                locator: 'lines 37-43',
                extract: 'export const SIG_PATTERN = /^[A-Za-z0-9_-]{85}[AQgw]$/;\nexport const SIG_TERMINAL_CHARS = new Set(["A", "Q", "g", "w"]);',
              },
            ],
          },
        ],
        limitations: ['Static analysis of client SDK only; did not stress-test live network load.'],
      };
      return result as unknown as T;
    }

    // Default generic fallback
    return {
      summary: 'Task executed successfully in simulated environment.',
      claims: [],
      evidence: [],
      limitations: [],
    } as unknown as T;
  }
}
