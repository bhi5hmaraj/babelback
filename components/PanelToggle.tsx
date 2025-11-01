"use client"

import React from 'react';
import { PanelVisibility } from '../types';
import Icon from './Icon';

interface PanelToggleProps {
  panelVisibility: PanelVisibility;
  onToggle: (panel: keyof PanelVisibility) => void;
}

const PanelToggle: React.FC<PanelToggleProps> = ({ panelVisibility, onToggle }) => {
  const toggleOptions: { key: keyof PanelVisibility; label: string; icon: string }[] = [
    { key: 'lyrics', label: 'Synced Lyrics', icon: 'list-dashes' }, // Changed from 'transliteration'
    { key: 'meaning', label: 'Meaning', icon: 'lightbulb' },
  ];

  return (
    <div className="my-6 p-4 bg-slate-800/80 rounded-lg shadow-md backdrop-blur-sm">
      <h3 className="text-md font-semibold text-slate-300 mb-3">Display Sections:</h3>
      <div className="flex flex-wrap gap-2 md:gap-3">
        {toggleOptions.map(option => (
          <button
            key={option.key}
            onClick={() => onToggle(option.key)}
            className={`flex items-center px-3 py-2 md:px-4 md:py-2 border rounded-lg text-xs md:text-sm transition-all duration-200 ease-in-out
                        ${panelVisibility[option.key]
                          ? 'bg-sky-600 border-sky-500 text-white hover:bg-sky-700 shadow-md'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-slate-500'
                        }`}
          >
            <Icon name={panelVisibility[option.key] ? 'eye' : 'eye-slash'} className="mr-2" weight="bold" />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PanelToggle;