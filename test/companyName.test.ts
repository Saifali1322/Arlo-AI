import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCompanyName,
  hasRequiredSuffix,
  isSameAs,
  normaliseForSameAs,
} from '../src/domain/companyName.js';

describe('normaliseForSameAs', () => {
  test('strips case, punctuation and spacing', () => {
    assert.equal(normaliseForSameAs('Acme Widgets Ltd'), 'acmewidgets');
    assert.equal(normaliseForSameAs('A.C.M.E.  Widgets,  Limited'), 'acmewidgets');
  });

  test('treats & and "and" as the same', () => {
    assert.equal(normaliseForSameAs('Smith & Jones Ltd'), normaliseForSameAs('Smith and Jones Limited'));
  });

  test('drops a leading "the"', () => {
    assert.equal(normaliseForSameAs('The Bakery Ltd'), normaliseForSameAs('Bakery Limited'));
  });

  test('disregards trailing words like UK, Group and Holdings', () => {
    const base = normaliseForSameAs('Northwind Limited');
    assert.equal(normaliseForSameAs('Northwind UK Ltd'), base);
    assert.equal(normaliseForSameAs('Northwind Holdings Limited'), base);
    assert.equal(normaliseForSameAs('Northwind Group Co Ltd'), base);
  });

  test('never strips a name down to nothing', () => {
    // "Holdings Limited" is all disregarded words — one must survive.
    assert.equal(normaliseForSameAs('Holdings Limited'), 'holdings');
  });

  test('expands symbol equivalences', () => {
    assert.equal(normaliseForSameAs('Coffee + Cake Ltd'), normaliseForSameAs('Coffee Plus Cake Limited'));
  });
});

describe('isSameAs', () => {
  test('matches names that differ only by disregarded parts', () => {
    assert.ok(isSameAs('The Northwind Trading Co Limited', 'Northwind Ltd'));
  });

  test('does not match genuinely different names', () => {
    assert.ok(!isSameAs('Northwind Limited', 'Southwind Limited'));
  });
});

describe('hasRequiredSuffix', () => {
  test('accepts English and Welsh suffixes', () => {
    for (const name of ['Acme Limited', 'Acme Ltd', 'Acme Ltd.', 'Acme Cyfyngedig', 'Acme Cyf']) {
      assert.ok(hasRequiredSuffix(name), name);
    }
  });

  test('rejects a bare name', () => {
    assert.ok(!hasRequiredSuffix('Acme Widgets'));
  });

  test('does not match a suffix embedded mid-name', () => {
    assert.ok(!hasRequiredSuffix('Limited Editions Company'));
  });
});

describe('checkCompanyName', () => {
  test('passes a clean name', () => {
    const result = checkCompanyName('Northwind Trading Limited');
    assert.equal(result.verdict, 'ok');
  });

  test('flags a missing suffix and suggests fixes', () => {
    const result = checkCompanyName('Northwind Trading');
    assert.equal(result.verdict, 'missing_suffix');
    assert.ok(result.suggestions.includes('Northwind Trading Limited'));
  });

  test('flags sensitive words with a reason', () => {
    const result = checkCompanyName('Royal Trust Limited');
    assert.equal(result.verdict, 'sensitive_word');
    const words = result.sensitiveWords!.map((s) => s.word);
    assert.ok(words.includes('royal'));
    assert.ok(words.includes('trust'));
  });

  test('sensitive-word check is case insensitive', () => {
    assert.equal(checkCompanyName('BRITISH Widgets Limited').verdict, 'sensitive_word');
  });

  test('does not flag an ordinary word containing a sensitive substring', () => {
    // "banking" is sensitive, "banks" as a surname is not — we match whole words.
    assert.equal(checkCompanyName('Banksy Interiors Limited').verdict, 'ok');
  });

  test('detects a clash against the register', () => {
    const result = checkCompanyName('Northwind Ltd', ['The Northwind Trading Co Limited']);
    assert.equal(result.verdict, 'same_as_existing');
    assert.equal(result.conflictsWith, 'The Northwind Trading Co Limited');
    assert.ok(result.suggestions.length > 0);
  });

  test('rejects an over-long name', () => {
    assert.equal(checkCompanyName(`${'a'.repeat(161)} Limited`).verdict, 'too_long');
  });

  test('rejects empty input', () => {
    assert.equal(checkCompanyName('   ').verdict, 'empty');
  });

  test('order of checks: sensitive words are reported before a missing suffix', () => {
    // Both problems are present; the caller should hear the harder one first,
    // because adding "Limited" would not fix it.
    assert.equal(checkCompanyName('Royal Widgets').verdict, 'sensitive_word');
  });
});
