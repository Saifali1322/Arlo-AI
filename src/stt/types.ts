/** Audio format on the wire, matched to the transport so nothing is transcoded. */
export type AudioFormat =
  | { encoding: 'mulaw'; sampleRate: 8000 } // Twilio Media Streams
  | { encoding: 'linear16'; sampleRate: 16000 }; // browser demo

export interface SttCallbacks {
  /**
   * Interim, unstable transcript. Used as the barge-in trigger: the moment the
   * caller produces words while the agent is speaking, we stop the agent.
   */
  onPartial: (text: string) => void;
  /** A complete utterance. This is what gets sent to the model. */
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface SttSession {
  /** Push a frame of caller audio. */
  send(chunk: Buffer): void;
  /** Flush and close. */
  close(): void;
  readonly ready: boolean;
}

export interface SttProvider {
  open(format: AudioFormat, callbacks: SttCallbacks): SttSession;
}
