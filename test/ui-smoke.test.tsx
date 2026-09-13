/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SwarmGraph } from '../src/components/SwarmGraph';
import { VerifyLedger } from '../src/components/VerifyLedger';
import { DisputeArena } from '../src/components/DisputeArena';
import { LifecycleRail } from '../src/components/primitives';
import type { Task } from '../src/core/types/task';
import type { Claim } from '../src/core/types/claims';
import type { Evidence } from '../src/core/types/evidence';

/**
 * UI smoke suite (#8): renders real components against real backend-shaped
 * state and asserts the visualization reflects it. No browser needed.
 * Full Playwright E2E (live mission → graph particles → stream) is the
 * documented follow-up; see test/e2e/README.
 */

const task: Task = {
  task_id: 'task_demo',
  mission_id: 'mission_demo',
  type: 'RESEARCH',
  title: 'Demo task',
  objective: 'Demonstrate UI wiring',
  requirements: [],
  required_capabilities: ['source-analysis'],
  dependencies: [],
  status: 'EXECUTING',
  assigned_agent: 'researcher-01',
  attempt: 1,
  created_at: new Date().toISOString(),
  deadline: new Date(Date.now() + 60_000).toISOString(),
};

const evidence: Evidence = {
  evidence_id: 'ev_demo_1',
  claim_id: 'claim_demo_1',
  source: 'src/demo.ts',
  locator: 'lines 1-20',
  extract: 'The demonstration extract contains substantive protocol content about signature verification behavior in detail.',
  collected_by: 'researcher-01',
  collected_at: new Date().toISOString(),
  untrusted: true,
};

const claim: Claim = {
  claim_id: 'claim_demo_1',
  statement: 'Signature verification behavior follows the protocol specification in detail.',
  type: 'FACT',
  origin_agent: 'researcher-01',
  origin_task_id: 'task_demo',
  evidence_refs: ['ev_demo_1'],
  confidence: 0.9,
  verification_status: 'VERIFIED',
  verified_by: 'verifier-01',
  verification_reason: 'Grounded in cited extract.',
  created_at: new Date().toISOString(),
};

describe('UI smoke: components reflect backend state', () => {
  it('SwarmGraph renders task + claim nodes from state', () => {
    const { container } = render(
      <SwarmGraph
        tasks={{ task_demo: task }}
        claims={{ claim_demo_1: claim }}
        evidenceGraph={{ ev_demo_1: evidence }}
        disputes={{}}
        envelopes={[]}
        agents={[]}
        missionStatus="EXECUTING"
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    // Hover inspector shows live counts
    expect(screen.getByText(/nodes ·/)).toBeDefined();
  });

  it('VerifyLedger shows grounded claim + evidence chip', () => {
    render(<VerifyLedger claims={{ claim_demo_1: claim }} evidenceGraph={{ ev_demo_1: evidence }} />);
    expect(screen.getByText(/Signature verification behavior/)).toBeDefined();
    expect(screen.getByText('ev_demo_1')).toBeDefined();
  });

  it('VerifyLedger flags dangling refs as missing', () => {
    const dangling: Claim = { ...claim, claim_id: 'claim_dangle', evidence_refs: ['ev_ghost'] };
    render(<VerifyLedger claims={{ claim_dangle: dangling }} evidenceGraph={{}} />);
    expect(screen.getByText(/dangling ref/)).toBeDefined();
  });

  it('DisputeArena empty state guides to chaos scenario', () => {
    render(<DisputeArena disputes={{}} claims={{}} />);
    expect(screen.getByText(/No disputes recorded/)).toBeDefined();
  });

  it('LifecycleRail highlights the active phase', () => {
    const { container } = render(<LifecycleRail status="VERIFYING" />);
    expect(container.textContent).toContain('VERIFY');
  });
});
