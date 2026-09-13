# CoreSwarm — Autonomous, Verifiable Multi-Agent Coordination

**A production reference implementation for autonomous, verifiable multi-agent coordination over the Technocore protocol mesh.**

CoreSwarm orchestrates specialized autonomous agents (Researcher, Analyst, Verifier, Synthesizer) to solve complex analytical and engineering missions with strict protocol verification, dynamic DAG decomposition, cryptographic prompt-injection isolation, adversarial dispute adjudication, backward evidence provenance, and event-sourced replay.

---

## The Core Problem

In traditional multi-agent architectures, agent confidence is frequently confused with ground truth. Agents hallucinate unsupported assertions, rubber-stamp upstream outputs, and silently drop contradictions when opinions collide.

**CoreSwarm enforces a fundamental protocol invariant:**

> **Agent confidence is NEVER treated as proof of verification.**
> Every claim must be grounded in cited evidence extracts, independently challenged by verifier agents, tested for contradictions, and fully traceable back through an immutable provenance graph.

---

## Architectural Overview

```
                                 ┌───────────────────────────────┐
                                 │       Human / Operator        │
                                 │     (Mission Objective)       │
                                 └──────────────┬────────────────┘
                                                │
                                                ▼
                                 ┌───────────────────────────────┐
                                 │    CoreSwarm Orchestrator     │
                                 │   • Mission State Machine     │
                                 │   • Event Sourcing Bus        │
                                 └──────────────┬────────────────┘
                                                │
                   ┌────────────────────────────┼────────────────────────────┐
                   │                            │                            │
                   ▼                            ▼                            ▼
        ┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
        │   Task DAG Engine   │      │   Agent Registry    │      │  Provenance Memory  │
        │ • Concurrent Tiers  │      │ • Capability Match  │      │ • Backward Trace    │
        │ • Dynamic Scheduling│      │ • Deterministic     │      │ • Replay Log        │
        └─────────────────────┘      └─────────────────────┘      └─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          Autonomous Agent Coordination Ring                            │
│                                                                                        │
│   ┌──────────────────┐      ┌──────────────────┐      ┌────────────────────────────┐   │
│   │ Researcher Agent │      │  Analyst Agent   │      │   Independent Verifier     │   │
│   │ • Source Audit   │─────▶│ • Risk Analysis  │─────▶│ • Evidence Cross-Check     │   │
│   │ • Evidence Extr. │      │ • Spec Validation│      │ • Dispute Adjudication     │   │
│   └──────────────────┘      └──────────────────┘      └────────────────────────────┘   │
│                                                                      │                 │
│                                                                      ▼                 │
│                                                       ┌────────────────────────────┐   │
│                                                       │     Synthesizer Agent      │   │
│                                                       │ • Traceable Audit Report   │   │
│                                                       │ • Provenance Summary       │   │
│                                                       └────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
                                 ┌───────────────────────────────┐
                                 │   Technocore Transport Mesh   │
                                 │  • Ed25519 Signed Envelopes   │
                                 │  • Unicode Swept (<=4096B)    │
                                 │  • Replay Attack Guard        │
                                 └───────────────────────────────┘
```

---

## Key Subsystems

### 1. Protocol Envelopes (`coreswarm/1`)
All multi-agent communication is structured as typed, cryptographically signed envelopes:
- **Ed25519 `did:key` Identity**: Every agent signs messages with private key material held locally.
- **Canonical Payload Construction**: Strictly canonicalized JSON serialization for tamper-evident hashing.
- **Unicode Sweeping**: Enforces the Technocore protocol invariant where envelopes are packaged into single-line swept messages ($\le 4096$ characters).
- **Anti-Replay Guard**: In-memory and monotonic sequence tracking with timestamp window verification prevents replay attacks.

### 2. Autonomous Task DAG
Complex missions are decomposed into Directed Acyclic Graphs with strict dependency tracking:
- **Execution Tiers**: Independent tasks execute in parallel; downstream tasks trigger automatically as dependencies succeed.
- **State Machine Isolation**: Finite state transitions (`PLANNED` $\rightarrow$ `DISCOVERING` $\rightarrow$ `ASSIGNED` $\rightarrow$ `EXECUTING` $\rightarrow$ `VERIFYING` $\rightarrow$ `COMPLETED` / `DISPUTED` / `FAILED`).

### 3. Cryptographic Prompt-Injection Defense
Strict boundary isolation prevents untrusted external data from hijacking agent directives:
- **Authoritative System Instructions**: High-priority rules isolating execution bounds.
- **Task Instructions**: Specific execution goals for the agent's assigned role.
- **Untrusted External Data Delimiters**: External code, markdown, and room messages are neutralized and sanitized before injection into model contexts.

### 4. Adversarial Dispute Resolution Arena
When two agents produce conflicting claims (e.g., whether signature verification is strict or permissive):
1. **Contradiction Detection**: Dispute engine identifies semantic conflicts between assertions.
2. **Dispute Creation**: Creates an adversarial challenge record and transitions affected tasks to `DISPUTED`.
3. **Supplemental Evidence Requests**: Demands exact code extracts and specifications from the conflicting parties.
4. **Independent Adjudication**: Verifier agents evaluate the evidence extracts without regard to the originating agent's self-assessed confidence score.

### 5. Backward Provenance Graph
Every assertion in the final mission report can be traced backward:
$$\text{Recommendation} \longrightarrow \text{Verified Claim} \longrightarrow \text{Evidence Extract} \longrightarrow \text{Source URI} \longrightarrow \text{Producing Agent} \longrightarrow \text{Protocol Event}$$

### 6. Event-Sourced Mission Replay
Every state transition emits an immutable `CoreSwarmEvent`. The `MissionReplayEngine` can reconstruct the exact state of all tasks, claims, evidence, and disputes at any step in time.

---

## Primary Reference Mission: "Technocore Integration Auditor"

CoreSwarm includes a complete end-to-end integration mission that audits a software project for Technocore protocol compliance:
- Audits DID generation and validation (`did:key:z6Mk...`).
- Verifies Unicode single-line sweeping (CRLF / null byte removal).
- Validates 19-digit timestamp/random nonce formatting.
- Challenges edge cases (e.g., room nonce synchronisation vs. independent note nonces).
- Resolves disputes with verifiable evidence extracts.
- Synthesizes an executive audit report with actionable risk recommendations.

---

## Verification & Testing

CoreSwarm is engineered with comprehensive test suites verifying all protocol invariants and end-to-end mission flows:

```bash
# Run unit & integration test suites
npm test

# Run strict TypeScript typechecking
npm run typecheck

# Build production Next.js application with Turbopack
npm run build
```

### Test Coverage Summary (34 tests):
- `test/protocol.test.ts`: Envelope validation, Ed25519 signing, replay detection, sweep invariants.
- `test/dag.test.ts`: Dependency resolution, cycle detection, execution tier scheduling.
- `test/state-machine.test.ts`: Deterministic task and mission state transitions.
- `test/verification.test.ts`: Verifier engine, evidence extract grounding, dispute adjudication.
- `test/replay.test.ts`: Event stream serialization and step-by-step state reconstruction.
- `test/auditor-mission.test.ts`: Complete end-to-end autonomous mission execution with dispute resolution and backward provenance tracing.
- `test/proof-scenarios.test.ts`: Seven crucial verification scenarios (disputes, evidence, adjudication, revision, timeout, malformed input, replay).
- `test/technocore-live.test.ts`: Live signed round-trip against the real Technocore mesh.
- `test/audit-regressions.test.ts`: Adversarial regression suite — verification attacks that must fail, security wiring, generic `runMission`, persistence round-trip.

---

## Project Structure

```text
coreswarm/
├── src/
│   ├── app/                    # Next.js 16 App Router & API Proxy
│   │   ├── api/proxy/route.ts  # Technocore mesh proxy (GET/POST)
│   │   ├── globals.css         # Dark cybernetic theme & design tokens
│   │   ├── layout.tsx          # Root HTML layout & metadata
│   │   └── page.tsx            # Live Mission Console & Observability Dashboard
│   ├── components/             # Living Protocol UI (final production interface)
│   │   ├── MissionShell.tsx        # Command shell: lifecycle rail, live status, nav
│   │   ├── CommandDeck.tsx         # Mission control: task structure + swarm + stream
│   │   ├── SwarmGraph.tsx          # Signature living network visualization
│   │   ├── EvidenceTrace.tsx       # Backward provenance: conclusion → source
│   │   ├── DisputeArena.tsx        # Side-by-side disputes + adjudication
│   │   ├── VerifyLedger.tsx        # Grounding ledger (VERIFIED = grounded in extracts)
│   │   ├── ReplayTheater.tsx       # Event-sourced mission time-travel
│   │   ├── ProtocolDebugger.tsx    # coreswarm/1 envelope debugger + Ed25519 checks
│   │   ├── AgentConstellation.tsx  # Registry, DIDs, capabilities, assignments
│   │   ├── Telemetry.tsx           # Measured-only runtime metrics
│   │   └── primitives.tsx          # DIDs, state dots/tags, lifecycle rail
│   └── core/                   # Pure Engine Architecture (Zero Framework Dependency)
│       ├── agents/             # BaseAgent, Researcher, Analyst, Verifier, Synthesizer
│       ├── crypto/             # Ed25519, did:key, canonicalize, nonce, sweep
│       ├── dag/                # TaskDAG dependency resolver
│       ├── llm/                # LLMProvider abstraction & Simulated provider
│       ├── orchestrator/       # Master Orchestrator, metrics, timeout monitors
│       ├── protocol/           # Envelope format, validator, replay guard
│       ├── provenance/         # Provenance graph & event memory
│       ├── registry/           # Deterministic capability matcher
│       ├── replay/             # MissionReplayEngine
│       ├── state/              # Mission and Task state machines
│       ├── transport/          # In-memory & Technocore mesh transport adapters
│       ├── types/              # Domain models & protocol interfaces
│       └── verification/       # DisputeEngine & VerifierEngine
└── test/                       # Vitest integration test suites
```

---

## Getting Started

### Prerequisites
- Node.js `>= 20.9.0`
- npm `>= 10.0.0`

### Installation
```bash
git clone https://github.com/Zeeyan05/coreswarm.git
cd coreswarm
npm install
```

### Local Development
```bash
# Start Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the CoreSwarm live mission console.

---

## License

MIT © Shaikh Zeeyan
