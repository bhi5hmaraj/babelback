"use client"

import React from 'react';
import { Language } from '../types';
import { SUPPORTED_LANGUAGES } from '../constants';
import Icon from './Icon';
import { cn } from '@/lib/utils';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onLanguageChange: (language: Language) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

// Using simpler text for flags/locale indication as universal flag emojis can be inconsistent.
const languageDisplay: Record<Language, string> = {
  [Language.ENGLISH]: "🇬🇧 English",
  [Language.HINDI]: "🇮🇳 हिन्दी (Hindi)",
  [Language.TAMIL]: "🇮🇳 தமிழ் (Tamil)",
  [Language.TELUGU]: "🇮🇳 తెలుగు (Telugu)",
  [Language.BENGALI]: "🇧🇩 বাংলা (Bengali)", // Or 🇮🇳 for West Bengal
};


const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selectedLanguage, onLanguageChange, disabled = false, className, label = 'Target language' }) => {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor="language-select" className="text-xs font-semibold uppercase tracking-[0.28em] text-[#a67c52]">
        {label}
      </label>
      <div className="relative">
        <select
          id="language-select"
          value={selectedLanguage}
          onChange={(e) => onLanguageChange(e.target.value as Language)}
          disabled={disabled}
          className={cn(
            'w-full appearance-none rounded-full border border-[#dbd0ba] bg-white/85 px-4 py-2 text-sm font-medium text-[#4a3f35] shadow-[0_6px_18px_rgba(74,63,53,0.08)] transition focus:border-[#a67c52] focus:outline-none focus:ring-0 disabled:opacity-60',
            disabled && 'cursor-not-allowed'
          )}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {languageDisplay[lang]}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#a67c52]">
          <Icon name="caret-down" size="sm" />
        </div>
      </div>
    </div>
  );
};

export default LanguageSelector;
