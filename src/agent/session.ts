/**
 * The conversation loop: caller audio -> STT -> Claude -> TTS -> caller.
 *
 * The interesting behaviour here is barge-in. A voice agent that keeps talking
 * over someone who has started speaking feels broken within about two seconds,
 * and it is the single most common reason these demos fail live. Handling it
 * properly means three things happening together the moment interim speech
 * appears:
 *
 *   1. abort the in-flight Claude generation (stop producing text)
 *   2. abort the in-flight TTS request (stop producing audio)
 *   3. clear audio already buffered *downstream* — Twilio may hold a second or
 *      more of queued playback, and dropping our end does nothing about it
 *
 * Miss (3) and the agent keeps talking for another second after it "stopped",
 * which is the exact thing you were trying to fix.
 */

import { Brain } from './brain.js';
import { SentenceChunker, sanitiseForSpeech } from './sentences.js';
import { fillerFor, greeting } from './prompt.js';
import type { ToolContext } from './tools.js';
import type { AudioFormat, SttSession } from '../stt/types.js';
import type { TtsFormat, TtsProvider } from '../tts/types.js';
import { deepgramStt } from '../stt/deepgram.js';
import { elevenLabsTts } from '../tts/elevenlabs.js';
import type { CallDisposition, LeadStore } from '../domain/leads.js';
import { config } from '../config.js';

/** What a transport (Twilio, browser) must provide. */
export interface Transport {
  readonly callSid: string;
  readonly callerNumber: string;
  readonly audioFormat: AudioFormat;
  readonly ttsFormat: TtsFormat;
  sendAudio(chunk: Buffer): void;
  /** Drop anything already buffered for playback. Critical for barge-in. */
  clearAudio(): void;
  transfer(reason: string): Promise<void>;
  hangUp(): Promise<void>;
  /** Optional — only telephony transports can send SMS. */
  sendSms?: (to: string, body: string) => Promise<void>;
  /** Optional — transports with a UI can mirror the transcript to it. */
  showTranscript?: (role: 'caller' | 'agent', text: string) => void;
}

export interface SessionDeps {
  leads: LeadStore;
  tts?: TtsProvider;
  stt?: typeof deepgramStt;
}

type State = 'idle' | 'thinking' | 'speaking';

/**
 * Interim transcripts fire on coughs, line noise and the word "um". Requiring a
 * couple of real words before treating it as an interruption avoids the agent
 * flinching at every sound on a bad line.
 */
const BARGE_IN_MIN_WORDS = 2;

export class CallSession {
  private readonly brain: Brain;
  private readonly stt: SttSession;
  private readonly tts: TtsProvider;
  private readonly chunker = new SentenceChunker();

  private state: State = 'idle';
  /** Aborts the current TTS request chain. Replaced on every speech turn. */
  private speechAbort = new AbortController();
  /** Serialises TTS so chunks play in the order they were generated. */
  private speechQueue: Promise<void> = Promise.resolve();
  private pendingDisposition?: CallDisposition;
  private closed = false;

  /** Assembled text of the current agent turn, for the transcript. */
  private currentUtterance = '';

  constructor(
    private readonly transport: Transport,
    private readonly deps: SessionDeps,
  ) {
    this.tts = deps.tts ?? elevenLabsTts;

    const toolContext: ToolContext = {
      callSid: transport.callSid,
      callerNumber: transport.callerNumber,
      leads: deps.leads,
      transfer: async (reason) => {
        await this.drainSpeech();
        await transport.transfer(reason);
      },
      hangUp: async (disposition) => {
        // Defer the actual hang-up until the goodbye has finished playing.
        this.pendingDisposition = disposition;
      },
      ...(transport.sendSms ? { sendSms: transport.sendSms } : {}),
    };

    this.brain = new Brain(toolContext);

    this.stt = (deps.stt ?? deepgramStt).open(transport.audioFormat, {
      onPartial: (text) => this.handlePartial(text),
      onFinal: (text) => this.handleFinal(text),
      onError: (err) => console.error(`[stt:${transport.callSid}]`, err.message),
    });
  }

  /** Speak the greeting. Call once the transport is ready for audio. */
  async start(): Promise<void> {
    const text = greeting();
    this.brain.recordAgentUtterance(text);
    this.deps.leads.addTurn(this.transport.callSid, 'agent', text);
    this.enqueueSpeech(text);
  }

  /** Feed a frame of caller audio in. */
  pushAudio(chunk: Buffer): void {
    if (!this.closed) this.stt.send(chunk);
  }

  async close(disposition: CallDisposition = 'abandoned'): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.speechAbort.abort();
    this.brain.interrupt();
    this.stt.close();
    await this.deps.leads.finish(this.transport.callSid, this.pendingDisposition ?? disposition);
  }

  // --- barge-in --------------------------------------------------------------

  private handlePartial(text: string): void {
    if (this.state === 'idle' || this.closed) return;

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length < BARGE_IN_MIN_WORDS) return;

    this.log(`barge-in on "${text}"`);

    // 1. stop generating, 2. stop synthesising, 3. drop buffered playback
    this.brain.interrupt();
    this.speechAbort.abort();
    this.speechAbort = new AbortController();
    this.chunker.reset();
    this.transport.clearAudio();

    // Record what the agent actually managed to say, not what it intended to.
    this.flushCurrentUtterance();
    this.state = 'idle';
  }

  // --- turns -----------------------------------------------------------------

  private handleFinal(text: string): void {
    if (this.closed) return;
    const utterance = text.trim();
    if (!utterance) return;

    this.log(`caller: ${utterance}`);
    this.deps.leads.addTurn(this.transport.callSid, 'caller', utterance);
    this.transport.showTranscript?.('caller', utterance);

    // A final transcript arriving mid-turn supersedes whatever we were saying.
    if (this.state !== 'idle') {
      this.brain.interrupt();
      this.speechAbort.abort();
      this.speechAbort = new AbortController();
      this.chunker.reset();
      this.transport.clearAudio();
      this.flushCurrentUtterance();
    }

    this.state = 'thinking';
    void this.runTurn(utterance);
  }

  private async runTurn(utterance: string): Promise<void> {
    const turnStarted = Date.now();
    let firstAudioAt: number | undefined;

    await this.brain.respond(utterance, {
      onText: (delta) => {
        for (const chunk of this.chunker.push(delta)) {
          if (firstAudioAt === undefined) {
            firstAudioAt = Date.now();
            this.log(`first speakable chunk in ${firstAudioAt - turnStarted}ms`);
          }
          this.enqueueSpeech(chunk);
        }
      },
      onToolStart: (toolName) => {
        // Never leave the line silent while a tool runs — dead air on a phone
        // call reads as a dropped connection.
        if (this.state === 'thinking' && this.currentUtterance === '') {
          this.enqueueSpeech(fillerFor(toolName));
        }
      },
      onTurnEnd: () => {
        const tail = this.chunker.flush();
        if (tail) this.enqueueSpeech(tail);
      },
    });

    await this.drainSpeech();
    this.flushCurrentUtterance();

    if (this.pendingDisposition) {
      await this.transport.hangUp();
      await this.close(this.pendingDisposition);
      return;
    }

    if (!this.closed) this.state = 'idle';
  }

  // --- speech ----------------------------------------------------------------

  /** Queue a fragment for synthesis. Order is preserved. */
  private enqueueSpeech(text: string): void {
    const clean = sanitiseForSpeech(text);
    if (!clean || this.closed) return;

    this.currentUtterance += (this.currentUtterance ? ' ' : '') + clean;
    this.state = 'speaking';

    const signal = this.speechAbort.signal;
    this.speechQueue = this.speechQueue
      .then(async () => {
        if (signal.aborted || this.closed) return;
        await this.tts.synthesize(
          clean,
          this.transport.ttsFormat,
          (audio) => {
            if (!signal.aborted && !this.closed) this.transport.sendAudio(audio);
          },
          signal,
        );
      })
      .catch((err) => {
        if (!signal.aborted) console.error(`[tts:${this.transport.callSid}]`, err);
      });
  }

  /** Wait for queued audio to finish being sent. */
  private async drainSpeech(): Promise<void> {
    await this.speechQueue;
  }

  private flushCurrentUtterance(): void {
    if (!this.currentUtterance) return;
    this.deps.leads.addTurn(this.transport.callSid, 'agent', this.currentUtterance);
    this.transport.showTranscript?.('agent', this.currentUtterance);
    this.log(`agent: ${this.currentUtterance}`);
    this.currentUtterance = '';
  }

  private log(message: string): void {
    if (config.logLevel === 'debug' || config.logLevel === 'info') {
      console.log(`[call:${this.transport.callSid}] ${message}`);
    }
  }
}
