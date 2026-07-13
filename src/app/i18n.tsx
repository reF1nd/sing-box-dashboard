import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { Select } from "../components/ui";
import { loadStoredString, removeStoredValue, saveStoredString } from "../lib/storage";
import { LANGUAGES, TRANSLATIONS, type Language, type MessageKey, type PluralForms } from "./translations";

export type { Language, MessageKey };

export type LanguagePreference = "auto" | Language;

const LANGUAGE_KEY = "language";

export function loadLanguagePreference(): LanguagePreference {
  const value = loadStoredString(LANGUAGE_KEY);
  if (value && LANGUAGES.some((language) => language.value === value)) {
    return value as Language;
  }
  return "auto";
}

export function saveLanguagePreference(preference: LanguagePreference) {
  if (preference === "auto") {
    removeStoredValue(LANGUAGE_KEY);
  } else {
    saveStoredString(LANGUAGE_KEY, preference);
  }
}

export function detectSystemLanguage(): Language {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("zh")) {
      if (/hant|tw|hk|mo/.test(lower)) {
        return "zh-Hant";
      }
      return "zh-Hans";
    }
    if (lower.startsWith("fa")) {
      return "fa";
    }
    if (lower.startsWith("ru")) {
      return "ru";
    }
    if (lower.startsWith("en")) {
      return "en";
    }
  }
  return "en";
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "fa" ? "rtl" : "ltr";
}

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

const pluralRulesCache = new Map<Language, Intl.PluralRules>();

function pluralRules(language: Language): Intl.PluralRules {
  let rules = pluralRulesCache.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRulesCache.set(language, rules);
  }
  return rules;
}

function translate(language: Language, key: MessageKey, params?: TranslateParams): string {
  const entry: string | PluralForms = language === "en" ? key : (TRANSLATIONS[key]?.[language] ?? key);
  let text: string;
  if (typeof entry === "string") {
    text = entry;
  } else {
    const count = typeof params?.count === "number" ? params.count : null;
    text = (count !== null ? entry[pluralRules(language).select(count)] : undefined) ?? entry.other;
  }
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

interface I18n {
  language: Language;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) {
    throw new Error("missing i18n context");
  }
  return i18n;
}

export function I18nProvider(props: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(() =>
    loadLanguagePreference(),
  );
  const [systemLanguage, setSystemLanguage] = useState<Language>(() => detectSystemLanguage());

  useEffect(() => {
    const onChange = () => setSystemLanguage(detectSystemLanguage());
    window.addEventListener("languagechange", onChange);
    return () => window.removeEventListener("languagechange", onChange);
  }, []);

  const language = preference === "auto" ? systemLanguage : preference;

  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      preference,
      setPreference: (next) => {
        saveLanguagePreference(next);
        setPreferenceState(next);
      },
      t: (key, params) => translate(language, key, params),
    }),
    [language, preference],
  );

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function LanguageSelect() {
  const { t, preference, setPreference } = useI18n();
  const options: { value: LanguagePreference; label: string }[] = [
    { value: "auto", label: t("System") },
    ...LANGUAGES.map((language) => ({ value: language.value, label: language.label })),
  ];
  return <Select inline options={options} value={preference} onChange={setPreference} />;
}
