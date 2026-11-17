import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { LocalizedText } from '@plateia/contracts';

export const LANGUAGES = ['pt', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'plateia.lang';
const LOCALES: Record<Language, string> = { pt: 'pt-BR', en: 'en-US' };

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // storage unavailable: fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

function ensureInitialized(): void {
  if (i18n.isInitialized) return;
  void i18n.use(initReactI18next).init({
    lng: detectLanguage(),
    fallbackLng: 'pt',
    supportedLngs: LANGUAGES,
    resources: {},
    interpolation: { escapeValue: false }, // React already escapes
  });
  document.documentElement.lang = LOCALES[currentLanguage()];
  i18n.on('languageChanged', (language) => {
    if (isLanguage(language)) document.documentElement.lang = LOCALES[language];
  });
}

/**
 * Each micro frontend owns its translations and registers them under its own
 * namespace when it loads. i18next is a federated singleton, so the shell and
 * the remotes share one instance and one current language.
 */
export function registerTranslations(namespace: string, bundles: Record<Language, object>): void {
  ensureInitialized();
  for (const language of LANGUAGES) {
    i18n.addResourceBundle(language, namespace, bundles[language], true, true);
  }
}

export function currentLanguage(): Language {
  const base = i18n.language?.slice(0, 2);
  return isLanguage(base) ? base : 'pt';
}

export function changeLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // not persisted, still applied for this visit
  }
}

/** Current language plus helpers that depend on it. Re-renders on language change. */
export function useLocale() {
  const { i18n: instance } = useTranslation();
  const base = instance.language?.slice(0, 2);
  const language: Language = isLanguage(base) ? base : 'pt';
  return {
    language,
    locale: LOCALES[language],
    localized: (text: LocalizedText) => text[language],
  };
}
