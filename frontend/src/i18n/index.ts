import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en.json';
import zhTranslation from './locales/zh.json';

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
    const savedLanguage = window.localStorage.getItem('language');
    if (savedLanguage === 'en' || savedLanguage === 'zh') {
      return savedLanguage;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.language.startsWith('zh')) {
    return 'zh';
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
