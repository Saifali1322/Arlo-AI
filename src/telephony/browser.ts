/**
 * Browser transport for the no-telephony demo.
 *
 * Runs the identical agent — same prompt, same tools, same brain — over a
 * plain WebSocket carrying PCM16 at 16 kHz. The only thing that changes is the
 * audio plumbing, which is exactly what you want in a demo: if it behaves in
 * the browser, it behaves on the phone.
 *
 * Useful because it needs only an Anthropic key plus Deepgram and ElevenLabs.
 * No Twilio account, no phone number, no public tunnel.
 */

import type { WebSocket } from 'ws';
import type { Transport } from '../agent/session.js';
import type { AudioFormat } from '../stt/types.js';
import type { TtsFormat } from '../tts/types.js';

export class BrowserTransport implements Transport {
  readonly audioFormat: AudioFormat = { encoding: 'linear16', sampleRate: 16000 };
  readonly ttsFormat: TtsFormat = 'pcm_16000';

  private ended = false;

  constructor(
    private readonly socket: WebSocket,
    readonly callSid: string,
    readonly callerNumber: string,
  ) {}

  sendAudio(chunk: Buffer): void {
    if (this.ended || this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(chunk, { binary: true });
  }

  clearAudio(): void {
    this.control({ type: 'clear' });
  }

  /** Mirror the transcript into the page so the demo is visible, not just audible. */
  showTranscript = (role: 'caller' | 'agent', text: string): void => {
    this.control({ type: 'transcript', role, text });
  };

  async transfer(reason: string): Promise<void> {
    this.control({ type: 'transfer', reason });
    await this.hangUp();
  }

  async hangUp(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.control({ type: 'ended' });
    setTimeout(() => {
      if (this.socket.readyState === this.socket.OPEN) this.socket.close();
    }, 250);
  }

  private control(payload: Record<string, unknown>): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }
}
