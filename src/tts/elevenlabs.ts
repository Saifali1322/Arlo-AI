/**
 * ElevenLabs streaming text-to-speech.
 *
 * Requests µ-law 8 kHz for the phone path and PCM 16 kHz for the browser demo,
 * so audio goes straight to the transport with no resampling — every
 * conversion step is somewhere quality goes to die and latency accumulates.
 *
 * `optimize_streaming_latency=3` trades a little prosody for a meaningfully
 * faster first byte. On a phone call that is the right trade: callers forgive
 * slightly flatter intonation, they do not forgive waiting.
 */

import { config } from '../config.js';
import type { TtsFormat, TtsProvider } from './types.js';

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

export const elevenLabsTts: TtsProvider = {
  async synthesize(text, format, onAudio, signal): Promise<void> {
    if (!config.elevenlabs.apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not set — text-to-speech is unavailable.');
    }
    const trimmed = text.trim();
    if (!trimmed) return;

    const url =
      `${ENDPOINT}/${config.elevenlabs.voiceId}/stream` +
      `?output_format=${format}&optimize_streaming_latency=3`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenlabs.apiKey,
        'content-type': 'application/json',
        accept: 'audio/*',
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: config.elevenlabs.model,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          // Slight downward style keeps it business-like rather than performative.
          style: 0.1,
          use_speaker_boost: true,
        },
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) break;
        if (value && value.length > 0) onAudio(Buffer.from(value));
      }
    } finally {
      // Releases the socket immediately on barge-in rather than draining it.
      reader.cancel().catch(() => {});
    }
  },
};
