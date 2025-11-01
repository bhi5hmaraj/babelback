"use client"

import React from 'react';
import Icon from './Icon';

export type TabItem = { id: string; label: string; icon?: string };

interface TabsBarProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/**
 * Horizontal tab strip used by the fixed-screen shell.
 * Keeps UI simple and touch-friendly on mobile.
 */
const TabsBar: React.FC<TabsBarProps> = ({ tabs, activeTab, onChange, disabled }) => {
  return (
    <nav className="w-full max-w-5xl px-3 md:px-0">
      <ul className="grid grid-cols-5 gap-2 md:flex md:justify-center md:space-x-2">
        {tabs.map(t => (
          <li key={t.id} className="list-none">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(t.id)}
              className={`w-full md:w-auto px-3 py-2 rounded-md text-xs sm:text-sm transition-colors flex items-center justify-center
                ${activeTab === t.id
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-800/80 text-sky-200 hover:bg-slate-700 hover:text-white'}
                disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {t.icon && <Icon name={t.icon as any} className="mr-1.5" />}
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TabsBar;

