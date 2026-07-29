/**
 * Streaming text -> speakable chunks.
 *
 * This is the single biggest lever on perceived latency. Claude streams tokens;
 * if we wait for the full response before calling TTS we add the whole
 * generation time to time-to-first-audio. Instead we flush the first speakable
 * fragment as soon as it exists, then feed the rest as it arrives.
 *
 * The trade-off is that flushing too eagerly produces choppy, badly-prosodied
 * speech. So: the first chunk flushes at the earliest clause boundary (low
 * latency where it matters most), and later chunks wait for sentence
 * boundaries (better prosody, and by then we're ahead of the audio clock).
 */

/** Abbreviations whose trailing period is not a sentence end. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'ltd', 'co', 'inc', 'plc', 'llp',
  'no', 'vs', 'etc', 'e.g', 'i.e', 'approx', 'dept', 'est', 'jr', 'sr',
]);

export interface ChunkerOptions {
  /** Emit the first chunk once this many characters are buffered. */
  firstChunkMinChars?: number;
  /** Emit later chunks once this many characters are buffered. */
  minChars?: number;
  /** Hard ceiling — flush even mid-sentence beyond this. */
  maxChars?: number;
}

const DEFAULTS: Required<ChunkerOptions> = {
  firstChunkMinChars: 12,
  // Low enough that two complete sentences are never welded into one chunk,
  // high enough that a stray "Right." doesn't become its own TTS request.
  minChars: 25,
  maxChars: 240,
};

/**
 * True when the period at `index` ends a sentence rather than an abbreviation,
 * a decimal, or an initial.
 */
function isSentenceEnd(text: string, index: number): boolean {
  const char = text[index];
  if (char !== '.') return true; // '!' and '?' are unambiguous

  // Decimal number: "3.5", "£1.99"
  const prev = text[index - 1];
  const next = text[index + 1];
  if (prev && /\d/.test(prev) && next && /\d/.test(next)) return false;

  // Single initial: "J. Smith"
  const before = text.slice(0, index);
  const lastWord = before.split(/[\s(]/).pop() ?? '';
  if (lastWord.length === 1 && /[A-Za-z]/.test(lastWord)) return false;

  if (ABBREVIATIONS.has(lastWord.toLowerCase())) return false;

  return true;
}

/**
 * Incremental chunker. Feed it deltas, take whatever complete chunks fall out,
 * then `flush()` at end of turn.
 */
export class SentenceChunker {
  private buffer = '';
  private isFirst = true;
  private readonly opts: Required<ChunkerOptions>;

  constructor(options: ChunkerOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Push a streamed delta; returns zero or more chunks ready to speak. */
  push(delta: string): string[] {
    this.buffer += delta;
    const chunks: string[] = [];

    for (;;) {
      const chunk = this.takeOne();
      if (chunk === undefined) break;
      chunks.push(chunk);
    }

    return chunks;
  }

  /** Emit whatever is left. Call once the model turn is complete. */
  flush(): string | undefined {
    const remaining = this.buffer.trim();
    this.buffer = '';
    this.isFirst = true;
    return remaining.length > 0 ? remaining : undefined;
  }

  /** Discard buffered text — used when the caller barges in. */
  reset(): void {
    this.buffer = '';
    this.isFirst = true;
  }

  private takeOne(): string | undefined {
    // The hard ceiling outranks the minimum — a buffer that has grown this far
    // without punctuation must be released regardless of the min-length gate,
    // or a long unpunctuated reply never starts playing at all.
    if (this.buffer.length >= this.opts.maxChars) {
      const slice = this.buffer.slice(0, this.opts.maxChars);
      const lastSpace = slice.lastIndexOf(' ');
      return this.cutAt(lastSpace > 0 ? lastSpace + 1 : this.opts.maxChars);
    }

    const minChars = this.isFirst ? this.opts.firstChunkMinChars : this.opts.minChars;
    if (this.buffer.trim().length < minChars) return undefined;

    const cut = this.findBoundary(minChars);
    return cut === undefined ? undefined : this.cutAt(cut);
  }

  private cutAt(index: number): string | undefined {
    const chunk = this.buffer.slice(0, index).trim();
    this.buffer = this.buffer.slice(index);
    if (chunk.length === 0) return undefined;
    this.isFirst = false;
    return chunk;
  }

  /**
   * Earliest acceptable boundary, or undefined to wait for more text.
   *
   * Single left-to-right pass so the *earliest* boundary wins. Scanning for
   * sentence ends first would make "Thanks for calling, how can I help?" flush
   * as one chunk — the comma at char 18 is the whole point of the early cut.
   */
  private findBoundary(minChars: number): number | undefined {
    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i]!;

      if (char === '.' || char === '!' || char === '?') {
        // Must be followed by whitespace or end of buffer, else we're mid-token.
        const next = this.buffer[i + 1];
        if (next !== undefined && !/[\s"')\]]/.test(next)) continue;
        if (!isSentenceEnd(this.buffer, i)) continue;
        if (this.buffer.slice(0, i + 1).trim().length < minChars) continue;
        return i + 1;
      }

      // A clause boundary is good enough to *start* audio, but only for the
      // first chunk — after that we have a head start and can favour prosody.
      if (this.isFirst && (char === ',' || char === ';' || char === ':' || char === '\n')) {
        if (this.buffer.slice(0, i).trim().length >= minChars) return i + 1;
      }
    }

    return undefined;
  }
}

/**
 * Strip anything that shouldn't reach TTS: markdown emphasis, list bullets,
 * code fences, and stray internal tags. The model is told not to emit these,
 * but a voice agent should never read "asterisk asterisk" to a caller.
 */
export function sanitiseForSpeech(text: string): string {
  return text
    .replace(/<\/?thinking>/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
