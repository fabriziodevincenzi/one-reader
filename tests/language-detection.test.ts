import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectLetterLanguage,
  MINIMUM_WORDS_FOR_LANGUAGE_DECISION,
  SUPPORTED_LANGUAGE_CODES,
} from '../supabase/functions/_shared/language-detection.ts';

test('maps the detected ISO code to the language code used by member profiles', () => {
  assert.deepEqual(detectLetterLanguage('A letter with enough words.', () => 'eng'), {
    kind: 'supported',
    languageCode: 'en',
  });
  assert.deepEqual(detectLetterLanguage('Et brev med nok ord.', () => 'nno'), {
    kind: 'supported',
    languageCode: 'no',
  });
});

test('limits detection to languages offered by One Reader', () => {
  let allowed: readonly string[] | undefined;
  detectLetterLanguage('A letter with enough words.', (_text, options) => {
    allowed = options.only;
    return 'eng';
  });
  assert.deepEqual(allowed, SUPPORTED_LANGUAGE_CODES);
});

test('asks for more text when franc cannot identify a short letter', () => {
  assert.deepEqual(detectLetterLanguage('Hello!', () => 'und'), {
    kind: 'too_short',
    wordCount: 1,
  });
});

test('marks an undetected long letter as unsupported', () => {
  const text = Array.from({ length: MINIMUM_WORDS_FOR_LANGUAGE_DECISION }, (_, index) => `word${index}`).join(' ');
  assert.deepEqual(detectLetterLanguage(text, () => 'und'), {
    kind: 'unsupported',
    wordCount: MINIMUM_WORDS_FOR_LANGUAGE_DECISION,
  });
});
