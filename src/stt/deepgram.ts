/**
 * Deepgram streaming speech-to-text.
 *
 * Two settings do most of the work on a phone call:
 *
 *   endpointing        how much silence ends an utterance. Too low and you cut
 *                      people off mid-sentence; too high and every turn feels
 *                      laggy. 800 ms is a reasonable default for UK callers
 *                      reading out details like emails, where they pause to
 *                      think mid-string.
 *
 *   utterance_end_ms   a backstop that fires on word-timing gaps even when the
 *                      line is noisy enough that VAD never sees true silence.
 *                      Without it, noisy calls hang.
 *
 * Interim results are on because they are the barge-in trigger, not because we
 * transcribe from them.
 */

import WebSocket from 'ws';
import { config } from '../config.js';
import type { AudioFormat, SttCallbacks, SttProvider, SttSession } from './types.js';

const KEEPALIVE_MS = 8000;

interface DeepgramMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string }> };
}

class DeepgramSession implements SttSession {
  private socket: WebSocket;
  private keepAlive?: NodeJS.Timeout;
  /** Frames that arrived before the socket opened. */
  private pending: Buffer[] = [];
  /** Finalised fragments awaiting an utterance boundary. */
  private fragments: string[] = [];
  private closed = false;

  ready = false;

  constructor(format: AudioFormat, private readonly callbacks: SttCallbacks) {
    const params = new URLSearchParams({
      model: config.deepgram.model,
      encoding: format.encoding,
      sample_rate: String(format.sampleRate),
      channels: '1',
      language: 'en-GB',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      // Fires UtteranceEnd events so we aren't relying on VAD alone.
      vad_events: 'true',
      endpointing: String(config.deepgram.endpointingMs),
      utterance_end_ms: String(config.deepgram.utteranceEndMs),
    });

    this.socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
      headers: { Authorization: `Token ${config.deepgram.apiKey}` },
    });

    this.socket.on('open', () => {
      this.ready = true;
      for (const chunk of this.pending) this.socket.send(chunk);
      this.pending = [];
      this.keepAlive = setInterval(() => {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, KEEPALIVE_MS);
      this.callbacks.onOpen?.();
    });

    this.socket.on('message', (raw) => this.handleMessage(raw));
    this.socket.on('error', (err) => this.callbacks.onError(err as Error));
    this.socket.on('close', () => {
      this.ready = false;
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.callbacks.onClose?.();
    });
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let message: DeepgramMessage;
    try {
      message = JSON.parse(raw.toString()) as DeepgramMessage;
    } catch {
      return;
    }

    // Word-timing backstop: flush whatever we have.
    if (message.type === 'UtteranceEnd') {
      this.emitUtterance();
      return;
    }

    if (message.type !== 'Results') return;

    const transcript = message.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
    if (!transcript) return;

    if (!message.is_final) {
      // Unstable text — only useful as "the caller is talking".
      this.callbacks.onPartial(transcript);
      return;
    }

    this.fragments.push(transcript);

    // speech_final means Deepgram detected end-of-speech, not just a stable
    // fragment. That's our cue to hand the utterance to the model.
    if (message.speech_final) this.emitUtterance();
  }

  private emitUtterance(): void {
    const text = this.fragments.join(' ').replace(/\s+/g, ' ').trim();
    this.fragments = [];
    if (text) this.callbacks.onFinal(text);
  }

  send(chunk: Buffer): void {
    if (this.closed) return;
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
    } else if (this.socket.readyState === WebSocket.CONNECTING) {
      // Bounded so a socket that never opens can't grow this without limit.
      if (this.pending.length < 250) this.pending.push(chunk);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.socket.readyState === WebSocket.OPEN) {
      // Tells Deepgram to flush and return any trailing transcript.
      this.socket.send(JSON.stringify({ type: 'CloseStream' }));
      this.socket.close();
    } else {
      this.socket.terminate();
    }
  }
}

export const deepgramStt: SttProvider = {
  open(format, callbacks) {
    if (!config.deepgram.apiKey) {
      throw new Error('DEEPGRAM_API_KEY is not set — speech-to-text is unavailable.');
    }
    return new DeepgramSession(format, callbacks);
  },
};
