
import React from 'react';
import Icon from './Icon';
import { CHANGELOG_ENTRIES } from '../changelogData'; // Assuming changelogData.ts is in the root
import { ChangelogEntry } from '../types';

interface ChangelogPageProps {
  onNavigateBack: () => void;
}

const ChangelogPage: React.FC<ChangelogPageProps> = ({ onNavigateBack }) => {
  return (
    <div className="w-full max-w-3xl bg-slate-800/70 backdrop-blur-md p-6 md:p-8 rounded-xl shadow-2xl my-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-sky-300">Changelog</h1>
        <button
          onClick={onNavigateBack}
          className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm flex items-center"
        >
          <Icon name="arrow-left" className="mr-2" /> Back to App
        </button>
      </div>

      {CHANGELOG_ENTRIES.length === 0 ? (
        <p className="text-slate-400 text-center py-4">No changelog entries yet. Check back soon!</p>
      ) : (
        <div className="space-y-8">
          {CHANGELOG_ENTRIES.map((entry, index) => (
            <section key={index} className="bg-slate-700/50 p-4 md:p-5 rounded-lg shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-2 pb-2 border-b border-slate-600">
                <h2 className="text-xl font-semibold text-purple-300">{entry.title}</h2>
                <div className="text-xs text-slate-400 mt-1 sm:mt-0">
                  <span className="font-medium">Version {entry.version}</span>
                  <span className="mx-1.5">|</span>
                  <span>{entry.date}</span>
                </div>
              </div>
              <ul className="list-disc list-inside text-slate-300 space-y-1.5 pl-2 text-sm">
                {entry.description.map((item, descIndex) => (
                  <li key={descIndex}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChangelogPage;
