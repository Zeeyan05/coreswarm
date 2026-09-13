import { describe, it, expect } from 'vitest';
import { Identity } from '../src/core/crypto/identity';
import { TechnocoreTransport } from '../src/core/transport/technocore';
import { verifyRoomMessage, verifyEnvelopeSignature, SIG_PATTERN, DID_PATTERN } from '../src/core/crypto/index';
import { sweep } from '../src/core/crypto/sweep';
import type { CoreSwarmEnvelope } from '../src/core/types/protocol';

describe('Layer 3: Authentic Technocore Protocol & Live Network Integration', () => {
  it('verifies Ed25519 DID, signature syntax, monotonic nonce, and canonical room signing', async () => {
    const identity = await Identity.generate();

    // 1. DID format verification: 56 chars, did:key:z6Mk...
    expect(identity.did).toMatch(DID_PATTERN);
    expect(identity.did.length).toBe(56);
    expect(identity.did.startsWith('did:key:z6Mk')).toBe(true);

    // 2. Room message signing with canonical payload: <room>|<nonce>|<sweptText>
    const room = 'coreswarm-v1-verify';
    const rawText = 'CoreSwarm V1 Protocol Verification Packet \u0000\u0007\u001f';
    const signResult = await identity.signMessage(room, rawText);

    // 3. Swept text validation: control characters stripped to single space and trimmed
    expect(signResult.sweptText).toBe(sweep(rawText));
    expect(signResult.sweptText).not.toContain('\u0000');

    // 4. Signature validation: 86 chars base64url ending in [AQgw]
    expect(signResult.sig).toMatch(SIG_PATTERN);
    expect(signResult.sig.length).toBe(86);
    const terminalChar = signResult.sig[85]!;
    expect(['A', 'Q', 'g', 'w']).toContain(terminalChar);

    // 5. Monotonic nonce validation
    const nonce1 = BigInt(signResult.nonce);
    const signResult2 = await identity.signMessage(room, 'Second packet');
    const nonce2 = BigInt(signResult2.nonce);
    expect(nonce2).toBeGreaterThan(nonce1);

    // 6. Outer room signature verification
    const outerVerify = await verifyRoomMessage(room, {
      did: identity.did,
      sig: signResult.sig,
      nonce: signResult.nonce,
      text: signResult.sweptText,
    });
    expect(outerVerify.valid).toBe(true);

    // 7. Tampered text fails outer verification
    const tamperedVerify = await verifyRoomMessage(room, {
      did: identity.did,
      sig: signResult.sig,
      nonce: signResult.nonce,
      text: 'Tampered room text',
    });
    expect(tamperedVerify.valid).toBe(false);
  });

  it('posts authentic signed coreswarm/1 envelope to live Technocore network and verifies round-trip packet', async () => {
    const testRoom = `coreswarm-live-${Date.now()}`;
    const senderIdentity = await Identity.generate();
    const recipientIdentity = await Identity.generate();

    const transport = new TechnocoreTransport({
      baseUrl: 'https://technocore.chat',
    });
    transport.registerIdentity(senderIdentity);

    // Construct authentic signed coreswarm/1 envelope
    const envelope: CoreSwarmEnvelope = await senderIdentity.signEnvelope({
      message_id: `msg_live_${Date.now()}`,
      message_type: 'TASK_REQUEST',
      mission_id: `mission_live_${Date.now()}`,
      task_id: 'task_audit_crypto',
      agent_id: 'orchestrator-live',
      recipient: { agent_id: 'researcher-01', did: recipientIdentity.did },
      payload: {
        task_id: 'task_audit_crypto',
        objective: 'Verify live Technocore transmission round-trip',
        requirements: ['live-ed25519-signature-audit'],
        required_capabilities: ['protocol-research'],
        deadline: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    // Send envelope over live Technocore room
    await transport.sendEnvelope(testRoom, envelope);

    // Fetch the raw room messages directly from Technocore API
    const fetchUrl = `https://technocore.chat/r/${encodeURIComponent(testRoom)}?format=json&limit=5`;
    const res = await fetch(fetchUrl);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      room: string;
      messages: Array<{
        seq: number;
        did?: string;
        from?: string;
        sig?: string;
        nonce?: number | string;
        text: string;
        time: number;
      }>;
    };

    expect(data.room).toBe(testRoom);
    expect(data.messages.length).toBeGreaterThanOrEqual(1);

    const liveMsg = data.messages[data.messages.length - 1]!;

    // 1. Verify outer Technocore packet properties
    const senderDid = liveMsg.from?.startsWith('did:key:') ? liveMsg.from : liveMsg.did;
    expect(senderDid).toBe(senderIdentity.did);
    expect(liveMsg.sig).toBeDefined();
    expect(liveMsg.sig!.length).toBe(86);
    expect(liveMsg.nonce).toBeDefined();

    // 2. Verify outer Technocore signature over <room>|<nonce>|<text>
    const outerVerify = await verifyRoomMessage(testRoom, {
      did: senderDid!,
      sig: liveMsg.sig!,
      nonce: String(liveMsg.nonce),
      text: liveMsg.text,
    });
    expect(outerVerify.valid).toBe(true);

    // 3. Inspect raw inner coreswarm/1 packet
    const parsedEnvelope = JSON.parse(liveMsg.text) as CoreSwarmEnvelope;
    expect(parsedEnvelope.protocol).toBe('coreswarm/1');
    expect(parsedEnvelope.message_id).toBe(envelope.message_id);
    expect(parsedEnvelope.sender.did).toBe(senderIdentity.did);
    expect(parsedEnvelope.recipient.did).toBe(recipientIdentity.did);

    // 4. Verify cryptographic signature on the inner coreswarm/1 envelope
    const innerVerify = await verifyEnvelopeSignature(parsedEnvelope);
    expect(innerVerify.valid).toBe(true);
    expect(innerVerify.signatureValid).toBe(true);

    await transport.disconnect();
  }, 15000); // 15s timeout for live network call
});
