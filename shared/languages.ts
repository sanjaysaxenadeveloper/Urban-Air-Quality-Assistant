export const SUPPORTED_LANGUAGE_CODES = [
  'en',
  'hi',
  'mr',
  'pa',
  'bn',
  'ta',
  'te',
  'gu',
  'kn',
  'ml',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export interface LanguageOption {
  code: SupportedLanguage;
  nativeLabel: string;
  englishLabel: string;
  locale: string;
  aiInstruction: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  {
    code: 'en',
    nativeLabel: 'English',
    englishLabel: 'English',
    locale: 'en-IN',
    aiInstruction: 'natural, clear English (Indian context)',
  },
  {
    code: 'hi',
    nativeLabel: 'हिन्दी',
    englishLabel: 'Hindi',
    locale: 'hi-IN',
    aiInstruction: 'natural, clear Hindi in Devanagari script (हिन्दी)',
  },
  {
    code: 'mr',
    nativeLabel: 'मराठी',
    englishLabel: 'Marathi',
    locale: 'mr-IN',
    aiInstruction: 'natural, clear Marathi in Devanagari script (मराठी)',
  },
  {
    code: 'pa',
    nativeLabel: 'ਪੰਜਾਬੀ',
    englishLabel: 'Punjabi',
    locale: 'pa-IN',
    aiInstruction: 'natural, clear Punjabi in Gurmukhi script (ਪੰਜਾਬੀ)',
  },
  {
    code: 'bn',
    nativeLabel: 'বাংলা',
    englishLabel: 'Bengali',
    locale: 'bn-IN',
    aiInstruction: 'natural, clear Bengali in Bengali script (বাংলা)',
  },
  {
    code: 'ta',
    nativeLabel: 'தமிழ்',
    englishLabel: 'Tamil',
    locale: 'ta-IN',
    aiInstruction: 'natural, clear Tamil in Tamil script (தமிழ்)',
  },
  {
    code: 'te',
    nativeLabel: 'తెలుగు',
    englishLabel: 'Telugu',
    locale: 'te-IN',
    aiInstruction: 'natural, clear Telugu in Telugu script (తెలుగు)',
  },
  {
    code: 'gu',
    nativeLabel: 'ગુજરાતી',
    englishLabel: 'Gujarati',
    locale: 'gu-IN',
    aiInstruction: 'natural, clear Gujarati in Gujarati script (ગુજરાતી)',
  },
  {
    code: 'kn',
    nativeLabel: 'ಕನ್ನಡ',
    englishLabel: 'Kannada',
    locale: 'kn-IN',
    aiInstruction: 'natural, clear Kannada in Kannada script (ಕನ್ನಡ)',
  },
  {
    code: 'ml',
    nativeLabel: 'മലയാളം',
    englishLabel: 'Malayalam',
    locale: 'ml-IN',
    aiInstruction: 'natural, clear Malayalam in Malayalam script (മലയാളം)',
  },
] as const;

export function getLanguageOption(code: string): LanguageOption {
  return (
    LANGUAGE_OPTIONS.find((opt) => opt.code === code) ?? LANGUAGE_OPTIONS[0]
  );
}
