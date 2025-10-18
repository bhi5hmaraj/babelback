"use client"

import React from 'react';
import Icon from './Icon';

interface AboutPageProps {
  onNavigateBack: () => void;
}

const AboutPage: React.FC<AboutPageProps> = ({ onNavigateBack }) => {
  const features = [
    { icon: 'microphone-stage', title: 'Synced Lyrics & Karaoke', description: 'Experience lyrics that update in real-time. Enable Karaoke Mode for word-by-word highlighting.' },
    { icon: 'translate', title: 'Multilingual Power', description: 'Get transcriptions, translations (to various languages), and phonetic transliterations.' },
    { icon: 'lightbulb', title: 'Deeper Meanings', description: 'Unlock verse-by-verse explanations, song summaries, and detailed cultural context powered by AI.' },
    { icon: 'waveform', title: 'Singing Practice Mode', description: 'Record yourself singing along and receive AI-driven feedback on your pronunciation, timing, and vocal clarity for each verse.'},
    { icon: 'books', title: 'Personal Song Library', description: 'Save your analyzed songs directly in your browser for quick access and offline enjoyment.' },
    { icon: 'gear', title: 'Audio Device Configuration', description: 'Select your preferred microphone and speaker/headphone outputs for an optimal experience.' },
  ];

  return (
    <div className="w-full max-w-3xl bg-slate-800/70 backdrop-blur-md p-6 md:p-8 rounded-xl shadow-2xl my-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-sky-300">About Babelback</h1>
        <button
          onClick={onNavigateBack}
          className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm flex items-center"
        >
          <Icon name="arrow-left" className="mr-2" /> Back to App
        </button>
      </div>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-purple-300 mb-3 flex items-center">
          <Icon name="info" weight="duotone" className="mr-3 text-purple-400" size="lg" />
          What is Babelback?
        </h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          Babelback is an innovative application designed to help you explore, understand, and connect with music from around the world, regardless of language barriers. Upload an audio file, and Babelback leverages advanced AI to provide a rich, interactive experience.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((feature) => (
            <div key={feature.title} className="bg-slate-700/70 p-4 rounded-lg shadow-md">
              <div className="flex items-center mb-2">
                <Icon name={feature.icon} weight="duotone" className={feature.icon === 'waveform' ? 'text-emerald-400' : 'text-purple-400'} mr-3 size="xl" />
                <h3 className="text-md font-semibold text-slate-100">{feature.title}</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-teal-300 mb-3 flex items-center">
            <Icon name="anchor-simple" weight="duotone" className="mr-3 text-teal-400" size="lg" />
            The Name: Babelback
        </h2>
        <p className="text-slate-300 leading-relaxed mb-2">
          The name "Babelback" is a portmanteau, blending two concepts that resonate with the app's core mission:
        </p>
        <div className="bg-slate-700/70 p-4 rounded-lg shadow-md mb-3">
            <div className="flex items-center mb-1">
                <Icon name="fish-simple" weight="fill" className="text-sky-400 mr-2" size="lg"/>
                <h4 className="font-semibold text-slate-200">Babel Fish</h4>
            </div>
          <p className="text-xs text-slate-300">
            Inspired by the "Babel Fish" from Douglas Adams' "The Hitchhiker's Guide to the Galaxy," a creature that provides instant universal translation. Babelback aims to act as your digital Babel Fish for music, breaking down linguistic barriers.
          </p>
        </div>
        <div className="bg-slate-700/70 p-4 rounded-lg shadow-md">
            <div className="flex items-center mb-1">
                 <Icon name="whale" weight="fill" className="text-indigo-400 mr-2" size="lg"/>
                <h4 className="font-semibold text-slate-200">Humpback Whale</h4>
            </div>
          <p className="text-xs text-slate-300">
            Humpback whales are renowned for their complex and beautiful songs that travel vast distances across oceans. These songs, while not understood by humans in a linguistic sense, evoke a sense of wonder and the universal power of "song." This reflects our appreciation for music's ability to connect us all.
          </p>
        </div>
        <p className="text-slate-300 leading-relaxed mt-3">
          Together, Babelback endeavors to be your companion in understanding the diverse languages of music and appreciating the profound, universal nature of song.
        </p>
      </section>
    </div>
  );
};

export default AboutPage;
