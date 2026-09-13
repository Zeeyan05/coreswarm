import { describe, it, expect } from 'vitest';
import { Identity } from '../src/core/crypto/identity';
import { ProtocolHandler } from '../src/core/protocol/envelope';
import { ReplayGuard } from '../src/core/protocol/replay-guard';
import { verifyEnvelopeSignature } from '../src/core/crypto/verify';

describe('CoreSwarm Protocol (coreswarm/1)', () => {
  it('signs and verifies a valid protocol envelope with Ed25519 and did:key', async () => {
    const sender = await Identity.generate();
    const recipient = await Identity.generate();

    const envelope = await sender.signEnvelope({
      message_id: 'msg_01J00000000000000000000001',
      message_type: 'TASK_REQUEST',
      mission_id: 'mission_01J0000000000000000000001',
      task_id: 'task_01J0000000000000000000001',
      agent_id: 'researcher-01',
      recipient: { agent_id: 'analyst-01', did: recipient.did },
      payload: {
        task_id: 'task_01',
        objective: 'Inspect protocol',
        requirements: ['inspect did.ts'],
        required_capabilities: ['research'],
        deadline: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    expect(envelope.protocol).toBe('coreswarm/1');
    expect(envelope.sender.did).toBe(sender.did);
    expect(envelope.signature.length).toBe(86);

    const sigResult = await verifyEnvelopeSignature(envelope);
    expect(sigResult.valid).toBe(true);
    expect(sigResult.didValid).toBe(true);
    expect(sigResult.signatureFormatValid).toBe(true);

    const handler = new ProtocolHandler();
    const parseResult = await handler.parseAndVerify(envelope);
    expect(parseResult.success).toBe(true);
    expect(parseResult.envelope?.message_id).toBe(envelope.message_id);
  });

  it('rejects tampered payload', async () => {
    const sender = await Identity.generate();
    const recipient = await Identity.generate();

    const envelope = await sender.signEnvelope({
      message_id: 'msg_01J00000000000000000000002',
      message_type: 'TASK_PROGRESS',
      mission_id: 'mission_01J0000000000000000000001',
      agent_id: 'researcher-01',
      recipient: { agent_id: 'orchestrator', did: recipient.did },
      payload: { progress: 50 },
    });

    // Tamper with payload
    const tampered = {
      ...envelope,
      payload: { progress: 99 },
    };

    const sigResult = await verifyEnvelopeSignature(tampered);
    expect(sigResult.valid).toBe(false);
  });

  it('detects and rejects replay attacks (duplicate message_id and stale nonces)', async () => {
    const guard = new ReplayGuard();
    const sender = await Identity.generate();
    const recipient = await Identity.generate();

    const envelope = await sender.signEnvelope({
      message_id: 'msg_01J00000000000000000000003',
      message_type: 'TASK_PROGRESS',
      mission_id: 'mission_01J0000000000000000000001',
      agent_id: 'researcher-01',
      recipient: { agent_id: 'orchestrator', did: recipient.did },
      payload: { progress: 10 },
    });

    const check1 = guard.validateEnvelope(envelope);
    expect(check1.ok).toBe(true);

    // Replay of same message_id
    const check2 = guard.validateEnvelope(envelope);
    expect(check2.ok).toBe(false);
    expect(check2.reason).toContain('Duplicate message_id');

    // Stale nonce with new message_id
    const staleEnvelope = {
      ...envelope,
      message_id: 'msg_01J00000000000000000000004',
      nonce: '1', // regressed nonce
    };
    const check3 = guard.validateEnvelope(staleEnvelope);
    expect(check3.ok).toBe(false);
    expect(check3.reason).toContain('Nonce regression');
  });
});
