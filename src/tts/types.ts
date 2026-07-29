/** Output encoding, matched to the transport so audio is never transcoded. */
export type TtsFormat = 'ulaw_8000' | 'pcm_16000';

export interface TtsProvider {
  /**
   * Synthesise `text`, invoking `onAudio` with each chunk as it arrives.
   * Must resolve when the audio is fully delivered, and abort promptly when
   * `signal` fires — that's the barge-in path.
   */
  synthesize(
    text: string,
    format: TtsFormat,
    onAudio: (chunk: Buffer) => void,
    signal: AbortSignal,
  ): Promise<void>;
}
