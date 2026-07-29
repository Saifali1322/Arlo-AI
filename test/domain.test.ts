import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSicCodes, getSicByCode, FALLBACK_SIC } from '../src/domain/sic.js';
import { findServices, formatPrice, CATALOGUE } from '../src/domain/catalogue.js';
import {
  isValidEmail,
  missingFields,
  normalisePhone,
  normaliseTitle,
  isComplete,
  LeadStore,
} from '../src/domain/leads.js';
import { encodeBuffer, decodeBuffer, frameEnergy, pcmToWav } from '../src/audio/mulaw.js';

describe('suggestSicCodes', () => {
  test('maps common spoken descriptions to the right code', () => {
    const cases: Array<[string, string]> = [
      ['I build websites and mobile apps for clients', '62012'],
      ['we sell handmade candles online through our own shop', '47910'],
      ['I am a plumber doing boiler repairs', '43220'],
      ['a barber shop', '96020'],
      ['I do management consultancy for small businesses', '70229'],
      ['we run a coffee shop', '56102'],
      ['bookkeeping and payroll for local firms', '69201'],
    ];
    for (const [description, expected] of cases) {
      const [best] = suggestSicCodes(description);
      assert.equal(best!.code, expected, `"${description}" -> got ${best!.code} ${best!.description}`);
    }
  });

  test('prefers the more specific multi-word match', () => {
    // "online shop" (specific) should beat a bare "shop".
    const [best] = suggestSicCodes('an online shop selling trainers');
    assert.equal(best!.code, '47910');
  });

  test('returns the fallback when nothing matches', () => {
    const [best] = suggestSicCodes('zzzz qqqq wubble');
    assert.equal(best!.code, FALLBACK_SIC.code);
  });

  test('handles empty input without throwing', () => {
    assert.equal(suggestSicCodes('')[0]!.code, FALLBACK_SIC.code);
  });

  test('returns at most the requested number of matches', () => {
    assert.ok(suggestSicCodes('software consultancy website design', 2).length <= 2);
  });

  test('getSicByCode round-trips', () => {
    assert.equal(getSicByCode('62012')?.code, '62012');
    assert.equal(getSicByCode('00000'), undefined);
  });
});

describe('catalogue', () => {
  test('every item has a unique id', () => {
    const ids = CATALOGUE.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('formats prices for speech', () => {
    const website = CATALOGUE.find((i) => i.id === 'website-5page')!;
    assert.equal(formatPrice(website), '£399');
    const seo = CATALOGUE.find((i) => i.id === 'seo-bronze')!;
    assert.equal(formatPrice(seo), '£99 a month');
    const formation = CATALOGUE.find((i) => i.id === 'formation')!;
    assert.equal(formatPrice(formation), 'free');
  });

  test('finds services from natural phrasing', () => {
    assert.equal(findServices('I need a website')[0]!.id, 'website-5page');
    assert.equal(findServices('somewhere to sell online')[0]!.id, 'website-ecommerce');
    assert.equal(findServices('a logo designed')[0]!.id, 'branding');
  });

  test('returns nothing for an unrelated query', () => {
    assert.equal(findServices('helicopter lessons').length, 0);
  });
});

describe('registration validation', () => {
  test('accepts and rejects emails', () => {
    assert.ok(isValidEmail('sam@example.co.uk'));
    assert.ok(!isValidEmail('sam@example'));
    assert.ok(!isValidEmail('not an email'));
  });

  test('normalises UK phone numbers to E.164', () => {
    assert.equal(normalisePhone('07700 900123'), '+447700900123');
    assert.equal(normalisePhone('+44 7700 900123'), '+447700900123');
    assert.equal(normalisePhone('00447700900123'), '+447700900123');
    assert.equal(normalisePhone('020 3432 8551'), '+442034328551');
  });

  test('rejects unusable phone input', () => {
    assert.equal(normalisePhone('12'), undefined);
    assert.equal(normalisePhone('not a number'), undefined);
  });

  test('normalises spoken titles', () => {
    assert.equal(normaliseTitle('mister'), 'Mr.');
    assert.equal(normaliseTitle('Mrs'), 'Mrs.');
    assert.equal(normaliseTitle('miss'), 'Ms.');
    assert.equal(normaliseTitle('Doctor'), undefined);
  });

  test('reports missing required fields', () => {
    assert.deepEqual(missingFields({}).sort(), [
      'companyName', 'email', 'firstName', 'lastName', 'phone', 'termsAccepted', 'title',
    ].sort());
  });

  test('terms must be explicitly true, not merely present', () => {
    const reg = {
      companyName: 'Acme Ltd', title: 'Mr.' as const, firstName: 'Sam', lastName: 'Lee',
      email: 'sam@acme.co', phone: '+447700900123', termsAccepted: false,
    };
    assert.ok(missingFields(reg).includes('termsAccepted'));
    assert.ok(isComplete({ ...reg, termsAccepted: true }));
  });
});

describe('LeadStore', () => {
  test('captures details incrementally and finds by contact', async () => {
    const store = new LeadStore(); // no file — memory only
    store.start('call_1', '+447700900123');

    store.update('call_1', { companyName: 'Northwind Limited' });
    store.update('call_1', { email: 'sam@northwind.co.uk' });
    // undefined must not clobber an existing value
    store.update('call_1', { companyName: undefined });

    const lead = store.get('call_1')!;
    assert.equal(lead.registration.companyName, 'Northwind Limited');
    assert.equal(lead.registration.phone, '+447700900123', 'caller number seeds the phone field');

    assert.equal(store.findByContact('sam@northwind.co.uk')?.callSid, 'call_1');
    assert.equal(store.findByContact('07700 900123')?.callSid, 'call_1');
    assert.equal(store.findByContact('nobody@example.com'), undefined);
  });

  test('records transcript turns and ignores blanks', () => {
    const store = new LeadStore();
    store.start('call_2', 'unknown');
    store.addTurn('call_2', 'caller', 'Hello there');
    store.addTurn('call_2', 'agent', '   ');
    assert.equal(store.get('call_2')!.transcript.length, 1);
  });
});

describe('mulaw codec', () => {
  test('round-trips within µ-law quantisation error', () => {
    const samples = [0, 100, -100, 1000, -1000, 8000, -8000, 20000, -20000, 32000, -32000];
    const pcm = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => pcm.writeInt16LE(s, i * 2));

    const decoded = decodeBuffer(encodeBuffer(pcm));

    samples.forEach((original, i) => {
      const result = decoded.readInt16LE(i * 2);
      // µ-law is logarithmic: error grows with amplitude, ~8% worst case.
      const tolerance = Math.max(200, Math.abs(original) * 0.1);
      assert.ok(
        Math.abs(result - original) <= tolerance,
        `sample ${original} decoded to ${result} (tolerance ${tolerance})`,
      );
    });
  });

  test('silence and loud audio have distinguishable energy', () => {
    const silence = encodeBuffer(Buffer.alloc(320)); // 160 zero samples
    const loudPcm = Buffer.alloc(320);
    for (let i = 0; i < 160; i++) loudPcm.writeInt16LE(i % 2 === 0 ? 20000 : -20000, i * 2);
    const loud = encodeBuffer(loudPcm);

    assert.ok(frameEnergy(silence) < 0.02, `silence energy ${frameEnergy(silence)}`);
    assert.ok(frameEnergy(loud) > 0.3, `loud energy ${frameEnergy(loud)}`);
  });

  test('empty frame has zero energy', () => {
    assert.equal(frameEnergy(Buffer.alloc(0)), 0);
  });

  test('wraps PCM in a valid WAV header', () => {
    const wav = pcmToWav(Buffer.alloc(160), 8000);
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    assert.equal(wav.readUInt32LE(24), 8000, 'sample rate');
    assert.equal(wav.readUInt16LE(34), 16, 'bits per sample');
    assert.equal(wav.readUInt32LE(40), 160, 'data length');
  });
});
