import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SentenceChunker, sanitiseForSpeech } from '../src/agent/sentences.js';

/** Feed a whole string through as one delta and collect everything emitted. */
function chunkAll(text: string, chunker = new SentenceChunker()): string[] {
  const out = chunker.push(text);
  const tail = chunker.flush();
  if (tail) out.push(tail);
  return out;
}

describe('SentenceChunker', () => {
  test('emits the first chunk early for low latency', () => {
    const chunker = new SentenceChunker();
    const first = chunker.push('Thanks for calling, how can I help you today?');
    assert.ok(first.length > 0, 'should emit before the full sentence completes');
    assert.ok(first[0]!.length < 45, 'first chunk should cut at the early clause boundary');
  });

  test('does not split on decimals', () => {
    const chunks = chunkAll('The website is 3.99 pounds a month and worth it.');
    assert.equal(chunks.length, 1);
  });

  test('does not split on abbreviations like Ltd. or Mr.', () => {
    const chunks = chunkAll('I have registered Acme Ltd. for you and it is confirmed now.');
    assert.ok(chunks.every((c) => !c.endsWith('Ltd.')), `unexpected split: ${JSON.stringify(chunks)}`);
  });

  test('does not split on single initials', () => {
    const chunks = chunkAll('That is registered to J. Smith and the details are saved.');
    assert.ok(chunks.every((c) => !c.endsWith('J.')));
  });

  test('splits multiple sentences after the first chunk', () => {
    const chunker = new SentenceChunker();
    chunker.push('Right, let me check that for you now please.');
    const rest = chunkAll(
      ' That name looks clear on the register today. What does the business actually do?',
      chunker,
    );
    assert.ok(rest.length >= 2, `expected several chunks, got ${JSON.stringify(rest)}`);
  });

  test('accumulates across deltas without losing text', () => {
    const chunker = new SentenceChunker();
    const deltas = ['That ', 'name ', 'looks ', 'clear ', 'on ', 'the ', 'register.', ' What next?'];
    const collected = deltas.flatMap((d) => chunker.push(d));
    const tail = chunker.flush();
    if (tail) collected.push(tail);

    const rejoined = collected.join(' ').replace(/\s+/g, ' ');
    assert.ok(rejoined.includes('That name looks clear on the register.'));
    assert.ok(rejoined.includes('What next?'));
  });

  test('flushes an unterminated fragment', () => {
    const chunker = new SentenceChunker();
    chunker.push('No terminator here');
    assert.equal(chunker.flush(), 'No terminator here');
  });

  test('honours the hard ceiling without splitting a word', () => {
    const chunker = new SentenceChunker({ firstChunkMinChars: 1000, minChars: 1000, maxChars: 40 });
    const chunks = chunker.push('supercalifragilistic expialidocious antidisestablishmentarianism words');
    assert.ok(chunks.length > 0);
    assert.ok(chunks[0]!.length <= 40);
    assert.ok(!chunks[0]!.endsWith('-'));
  });

  test('reset discards buffered text on barge-in', () => {
    const chunker = new SentenceChunker();
    chunker.push('Half a sentence that never');
    chunker.reset();
    assert.equal(chunker.flush(), undefined);
  });
});

describe('sanitiseForSpeech', () => {
  test('strips markdown that would otherwise be read aloud', () => {
    assert.equal(sanitiseForSpeech('**Bold** and *italic*'), 'Bold and italic');
    assert.equal(sanitiseForSpeech('## Heading'), 'Heading');
    assert.equal(sanitiseForSpeech('- first\n- second'), 'first second');
  });

  test('strips stray thinking tags', () => {
    assert.equal(sanitiseForSpeech('<thinking>hmm</thinking>Hello'), 'hmmHello');
  });

  test('collapses whitespace', () => {
    assert.equal(sanitiseForSpeech('too    many\n\nspaces'), 'too many spaces');
  });

  test('leaves ordinary speech untouched', () => {
    const text = "That's 399 pounds, and it takes 3 to 6 hours.";
    assert.equal(sanitiseForSpeech(text), text);
  });
});
