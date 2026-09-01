export const SUPPORTED_LANGUAGE_CODES = [
  'eng', 'spa', 'fra', 'deu', 'swe', 'dan', 'nob', 'nno',
  'ukr', 'jpn', 'pol', 'por', 'nld', 'ita',
] as const;

const profileLanguageByDetectedCode: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  swe: 'sv',
  dan: 'da',
  nob: 'no',
  nno: 'no',
  ukr: 'uk',
  jpn: 'ja',
  pol: 'pl',
  por: 'pt',
  nld: 'nl',
  ita: 'it',
};

export const MINIMUM_WORDS_FOR_LANGUAGE_DECISION = 15;

type DetectLanguage = (text: string, options: { only: readonly string[] }) => string;

export type LanguageDetection =
  | { kind: 'supported'; languageCode: string }
  | { kind: 'too_short'; wordCount: number }
  | { kind: 'unsupported'; wordCount: number };

export function detectLetterLanguage(text: string, detect: DetectLanguage): LanguageDetection {
  const detectedCode = detect(text, { only: SUPPORTED_LANGUAGE_CODES });
  const languageCode = profileLanguageByDetectedCode[detectedCode];
  if (languageCode) return { kind: 'supported', languageCode };

  const wordCount = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return wordCount < MINIMUM_WORDS_FOR_LANGUAGE_DECISION
    ? { kind: 'too_short', wordCount }
    : { kind: 'unsupported', wordCount };
}
