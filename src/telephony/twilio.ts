/**
 * Twilio Voice + Media Streams transport.
 *
 * Twilio speaks 8 kHz µ-law over a bidirectional WebSocket, base64-encoded
 * inside JSON frames. That matches what Deepgram accepts and what ElevenLabs
 * emits, so audio crosses this boundary without transcoding.
 *
 * The `clear` event is the important one: Twilio buffers outbound audio, so
 * cancelling our TTS request alone leaves up to a second of already-sent speech
 * still queued to play. `clear` drops that buffer, and without it barge-in
 * looks broken no matter how fast the rest of the pipeline reacts.
 */

import type { WebSocket } from 'ws';
import twilio from 'twilio';
import { config } from '../config.js';
import type { Transport } from '../agent/session.js';
import type { AudioFormat } from '../stt/types.js';
import type { TtsFormat } from '../tts/types.js';

const restClient =
  config.twilio.accountSid && config.twilio.authToken
    ? twilio(config.twilio.accountSid, config.twilio.authToken)
    : undefined;

/**
 * TwiML returned from the inbound-call webhook. `<Connect><Stream>` hands the
 * call's audio to our WebSocket and blocks until the socket closes.
 */
export function inboundCallTwiml(wsUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(wsUrl)}" />
  </Connect>
</Response>`;
}

/** Played if the agent cannot start — better than silence then a dead line. */
export function failureTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy-Neural">Sorry, our assistant is unavailable right now. Please call back shortly.</Say>
  <Hangup/>
</Response>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Verify the request genuinely came from Twilio. Without this, anyone who
 * discovers the URL can drive your agent — and your Anthropic spend.
 */
export function verifyTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!config.twilio.validateSignature) return true;
  if (!config.twilio.authToken || !signature) return false;
  return twilio.validateRequest(config.twilio.authToken, signature, url, params);
}

interface TwilioStartEvent {
  event: 'start';
  start: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
}
interface TwilioMediaEvent {
  event: 'media';
  media: { payload: string; track?: string };
}
type TwilioEvent = TwilioStartEvent | TwilioMediaEvent | { event: 'connected' | 'stop' | 'mark' };

export class TwilioTransport implements Transport {
  readonly audioFormat: AudioFormat = { encoding: 'mulaw', sampleRate: 8000 };
  readonly ttsFormat: TtsFormat = 'ulaw_8000';

  private streamSid?: string;
  private ended = false;

  constructor(
    private readonly socket: WebSocket,
    readonly callSid: string,
    readonly callerNumber: string,
  ) {}

  /** Bind the stream identifier from Twilio's `start` frame. */
  bindStream(streamSid: string): void {
    this.streamSid = streamSid;
  }

  /** Parse an inbound frame; returns caller audio when the frame carries it. */
  static parseFrame(raw: string): { type: 'start'; streamSid: string; callSid: string }
    | { type: 'media'; audio: Buffer }
    | { type: 'stop' }
    | { type: 'other' } {
    let event: TwilioEvent;
    try {
      event = JSON.parse(raw) as TwilioEvent;
    } catch {
      return { type: 'other' };
    }

    if (event.event === 'start') {
      const start = (event as TwilioStartEvent).start;
      return { type: 'start', streamSid: start.streamSid, callSid: start.callSid };
    }
    if (event.event === 'media') {
      const media = (event as TwilioMediaEvent).media;
      return { type: 'media', audio: Buffer.from(media.payload, 'base64') };
    }
    if (event.event === 'stop') return { type: 'stop' };
    return { type: 'other' };
  }

  sendAudio(chunk: Buffer): void {
    if (this.ended || !this.streamSid || this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: chunk.toString('base64') },
      }),
    );
  }

  clearAudio(): void {
    if (this.ended || !this.streamSid || this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
  }

  async transfer(reason: string): Promise<void> {
    console.log(`[twilio:${this.callSid}] transferring — ${reason}`);
    this.ended = true;

    if (!restClient || !config.humanHandoffNumber) {
      console.warn('[twilio] transfer requested but HUMAN_HANDOFF_NUMBER is not configured');
      await this.hangUp();
      return;
    }

    try {
      // Redirecting the live call replaces the <Connect><Stream> verb, which
      // closes our WebSocket as a side effect.
      await restClient.calls(this.callSid).update({
        twiml: `<Response><Say voice="Polly.Amy-Neural">Putting you through now.</Say><Dial>${escapeXml(config.humanHandoffNumber)}</Dial></Response>`,
      });
    } catch (err) {
      console.error(`[twilio:${this.callSid}] transfer failed`, err);
      await this.hangUp();
    }
  }

  async hangUp(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    try {
      if (restClient) {
        await restClient.calls(this.callSid).update({ status: 'completed' });
      } else if (this.socket.readyState === this.socket.OPEN) {
        this.socket.close();
      }
    } catch (err) {
      console.error(`[twilio:${this.callSid}] hangup failed`, err);
    }
  }

  sendSms = restClient
    ? async (to: string, body: string): Promise<void> => {
        if (!config.twilio.phoneNumber) {
          console.warn('[twilio] TWILIO_PHONE_NUMBER not set — cannot send SMS');
          return;
        }
        await restClient.messages.create({ to, from: config.twilio.phoneNumber, body });
      }
    : undefined;
}
