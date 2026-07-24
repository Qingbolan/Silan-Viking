import React, { createContext, useState, useContext, useCallback, useEffect, useMemo, ReactNode } from 'react';
import i18n from '../i18n/index';
import type { Language } from '../types/api';
import { languageFromPathname, localizedBrowserHref, rememberPreferredLanguage } from '../lib/localeRouting';

interface LanguageContextType {
  language: Language;
  languageHref: (language: Language) => string;
  selectLanguage: (language: Language) => void;
  t: (key: string) => string;
}

interface LanguageProviderProps {
  children: ReactNode;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language] = useState<Language>(() => languageFromPathname(window.location.pathname));

  const languageHref = useCallback(
    (lang: Language) => localizedBrowserHref(lang),
    [],
  );
  const selectLanguage = useCallback((lang: Language) => {
    rememberPreferredLanguage(lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-Hans' : 'en';
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  const t = useCallback((key: string): string => {
    return i18n.t(key);
  }, []);

  const contextValue: LanguageContextType = useMemo(() => ({
    language,
    languageHref,
    selectLanguage,
    t,
  }), [language, languageHref, selectLanguage, t]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}; 
