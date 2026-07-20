import React from 'react';
import { X } from 'lucide-react';

export type LanguageCloseTab = {
  language: string;
  dirty?: boolean;
  disabled?: boolean;
};

type LanguageCloseControlsProps = {
  languages?: LanguageCloseTab[];
  activeLanguage?: string;
  fixed?: boolean;
  disabled?: boolean;
  closeLabel: string;
  closeTitle?: string;
  closeSize?: number;
  className?: string;
  onLanguageSelect?: (language: string) => void;
  onClose: () => void;
};

const defaultLanguages: LanguageCloseTab[] = [
  { language: 'en' },
  { language: 'zh' },
];

export function LanguageCloseControls({
  languages = defaultLanguages,
  activeLanguage,
  fixed = false,
  disabled = false,
  closeLabel,
  closeTitle,
  closeSize = 18,
  className = '',
  onLanguageSelect,
  onClose,
}: LanguageCloseControlsProps) {
  const tabs = languages.length > 0 ? languages : defaultLanguages;
  const selectedLanguage = activeLanguage || tabs[0]?.language || 'en';

  return (
    <div className={`language-close-controls${fixed ? ' language-close-controls-fixed' : ''}${className ? ` ${className}` : ''}`}>
      <div className="language-tabs" role="tablist" aria-label="Language representations">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            key={tab.language}
            aria-selected={tab.language === selectedLanguage}
            className={tab.language === selectedLanguage ? 'active' : ''}
            disabled={disabled || tab.disabled}
            onClick={() => onLanguageSelect?.(tab.language)}
          >
            {tab.language}
            {tab.dirty && <span />}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="language-close-button"
        disabled={disabled}
        onClick={onClose}
        title={closeTitle}
        aria-label={closeLabel}
      >
        <X size={closeSize} />
      </button>
    </div>
  );
}
