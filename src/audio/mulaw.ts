/**
 * G.711 µ-law codec.
 *
 * The Twilio <-> Deepgram <-> ElevenLabs path is µ-law end to end (Deepgram
 * accepts `encoding=mulaw`, ElevenLabs emits `ulaw_8000`), so the live audio
 * never needs transcoding. This module exists for the two places we do need
 * linear PCM:
 *
 *   1. RMS energy, used as a cheap pre-trigger for barge-in.
 *   2. Writing call recordings as WAV, which is how you actually tune a voice
 *      agent — you listen to where it talked over someone.
 *
 * Implementation follows the reference Sun/CCITT G.711 routines.
 */

const BIAS = 0x84;
const CLIP = 8159;
const SEG_END = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];

/** µ-law byte -> 16-bit signed PCM. Precomputed: 256 entries. */
const DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  let t = ((u & 0x0f) << 3) + BIAS;
  t <<= (u & 0x70) >> 4;
  DECODE_TABLE[i] = (u & 0x80) !== 0 ? BIAS - t : t - BIAS;
}

function segmentFor(value: number): number {
  for (let i = 0; i < SEG_END.length; i++) {
    if (value <= SEG_END[i]!) return i;
  }
  return SEG_END.length;
}

/** 16-bit signed PCM sample -> µ-law byte. */
export function encodeSample(pcm: number): number {
  let value = pcm >> 2; // 16-bit -> 14-bit
  let mask: number;

  if (value < 0) {
    value = -value;
    mask = 0x7f;
  } else {
    mask = 0xff;
  }

  if (value > CLIP) value = CLIP;
  value += BIAS >> 2;

  const seg = segmentFor(value);
  if (seg >= 8) return 0x7f ^ mask;

  const uval = (seg << 4) | ((value >> (seg + 1)) & 0x0f);
  return (uval ^ mask) & 0xff;
}

/** µ-law byte -> 16-bit signed PCM sample. */
export function decodeSample(ulaw: number): number {
  return DECODE_TABLE[ulaw & 0xff]!;
}

/** Decode a µ-law buffer into little-endian 16-bit PCM. */
export function decodeBuffer(ulaw: Buffer): Buffer {
  const out = Buffer.allocUnsafe(ulaw.length * 2);
  for (let i = 0; i < ulaw.length; i++) {
    out.writeInt16LE(DECODE_TABLE[ulaw[i]!]!, i * 2);
  }
  return out;
}

/** Encode little-endian 16-bit PCM into µ-law. */
export function encodeBuffer(pcm: Buffer): Buffer {
  const samples = pcm.length >> 1;
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = encodeSample(pcm.readInt16LE(i * 2));
  }
  return out;
}

/**
 * Root-mean-square amplitude of a µ-law frame, normalised to 0..1.
 * Twilio sends 20 ms frames (160 bytes at 8 kHz), which is plenty for this.
 */
export function frameEnergy(ulaw: Buffer): number {
  if (ulaw.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < ulaw.length; i++) {
    const sample = DECODE_TABLE[ulaw[i]!]! / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / ulaw.length);
}

/** Wrap raw PCM16 in a WAV container so recordings open in any player. */
export function pcmToWav(pcm: Buffer, sampleRate = 8000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
