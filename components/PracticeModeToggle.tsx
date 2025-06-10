
import React from 'react';
import Icon from './Icon';

interface PracticeModeToggleProps {
  isPracticeModeEnabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}

const PracticeModeToggle: React.FC<PracticeModeToggleProps> = ({ isPracticeModeEnabled, onToggle, disabled }) => {
  return (
    <div className="my-5 p-4 bg-slate-800/60 rounded-lg shadow-md backdrop-blur-sm flex items-center justify-between">
      <div className="flex items-center">
        <Icon name="waveform" weight="duotone" className="text-emerald-400 mr-3 text-xl" />
        <div>
          <label htmlFor="practice-mode-toggle-button" className="text-md font-semibold text-slate-100">
            Singing Practice Mode
          </label>
          <p className="text-xs text-slate-400">Record yourself and get AI feedback.</p>
        </div>
      </div>
      <button
        id="practice-mode-toggle-button"
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-emerald-500 ${
          isPracticeModeEnabled ? 'bg-emerald-600' : 'bg-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-700'}`}
        aria-pressed={isPracticeModeEnabled}
      >
        <span className="sr-only">Enable Singing Practice Mode</span>
        <span
          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
            isPracticeModeEnabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export default PracticeModeToggle;