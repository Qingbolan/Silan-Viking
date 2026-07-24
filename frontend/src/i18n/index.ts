import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en.json';
import zhTranslation from './locales/zh.json';
import { languageFromPathname } from '../lib/localeRouting';

const resources = {
  en: {
    translation: enTranslation
  },
  zh: {
    translation: zhTranslation
  }
};

const getInitialLanguage = (): 'en' | 'zh' => {
  if (typeof window !== 'undefined') {
    return languageFromPathname(window.location.pathname);
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    }
  });

export default i18n; 
