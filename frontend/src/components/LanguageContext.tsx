import React, { createContext, useState, useContext, useCallback, useMemo, ReactNode } from 'react';
import i18n from '../i18n/index';
import type { Language } from '../types/api';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  changeLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

interface LanguageProviderProps {
  children: ReactNode;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'zh')) {
      return savedLanguage as Language;
    }
    // Set default language based on browser language
    return navigator.language.startsWith('zh') ? 'zh' : 'en';
  });

  const applyLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    void i18n.changeLanguage(lang);
  }, []);

  const t = useCallback((key: string): string => {
    return i18n.t(key);
  }, []);

  const contextValue: LanguageContextType = useMemo(() => ({
    language,
    setLanguage: applyLanguage,
    changeLanguage: applyLanguage,
    t,
  }), [language, applyLanguage, t]);

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
