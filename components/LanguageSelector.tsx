"use client"

import React from 'react';
import { Language } from '../types';
import { SUPPORTED_LANGUAGES } from '../constants';
import Icon from './Icon';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onLanguageChange: (language: Language) => void;
  disabled: boolean;
}

// Using simpler text for flags/locale indication as universal flag emojis can be inconsistent.
const languageDisplay: Record<Language, string> = {
  [Language.ENGLISH]: "🇬🇧 English",
  [Language.HINDI]: "🇮🇳 हिन्दी (Hindi)",
  [Language.TAMIL]: "🇮🇳 தமிழ் (Tamil)",
  [Language.TELUGU]: "🇮🇳 తెలుగు (Telugu)",
  [Language.BENGALI]: "🇧🇩 বাংলা (Bengali)", // Or 🇮🇳 for West Bengal
};


const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selectedLanguage, onLanguageChange, disabled }) => {
  return (
    <div className="mb-6">
      <label htmlFor="language-select" className="block text-sm font-medium text-slate-300 mb-1">
        Translate to:
      </label>
      <div className="relative">
        <select
          id="language-select"
          value={selectedLanguage}
          onChange={(e) => onLanguageChange(e.target.value as Language)}
          disabled={disabled}
          className="w-full p-3 border border-slate-600 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-slate-700 text-slate-100 appearance-none pr-10 transition-colors"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {languageDisplay[lang]}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
          <Icon name="caret-down" size="sm" />
        </div>
      </div>
    </div>
  );
};

export default LanguageSelector;
