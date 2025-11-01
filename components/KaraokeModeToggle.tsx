import React from 'react';
import Icon from './Icon';

interface KaraokeModeToggleProps {
  isKaraokeMode: boolean;
  onToggle: () => void;
  disabled: boolean;
}

const KaraokeModeToggle: React.FC<KaraokeModeToggleProps> = ({ isKaraokeMode, onToggle, disabled }) => {
  return (
    <div className="my-5 p-4 bg-slate-800/60 rounded-lg shadow-md backdrop-blur-sm flex items-center justify-between">
      <div className="flex items-center">
        <Icon name="microphone-stage" weight="duotone" className="text-purple-400 mr-3 text-xl" />
        <div>
            <label htmlFor="karaoke-toggle-button" className="text-md font-semibold text-slate-100">
            Karaoke Mode
            </label>
            <p className="text-xs text-slate-400">Synchronize transliteration word-by-word.</p>
        </div>
      </div>
      <button
        id="karaoke-toggle-button"
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500 ${
          isKaraokeMode ? 'bg-purple-600' : 'bg-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700'}`}
        aria-pressed={isKaraokeMode}
      >
        <span className="sr-only">Enable Karaoke Mode</span>
        <span
          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
            isKaraokeMode ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export default KaraokeModeToggle;