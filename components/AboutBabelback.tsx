
import React from 'react';
import Icon from './Icon';

const AboutBabelback: React.FC = () => {
  const features = [
    { icon: 'microphone-stage', title: 'Synced Lyrics', description: 'Experience lyrics that update in real-time as your uploaded audio plays.' },
    { icon: 'translate', title: 'Multilingual Power', description: 'Get transcriptions, translations, and transliterations in various languages.' },
    { icon: 'lightbulb', title: 'Deeper Meanings', description: 'Unlock verse-by-verse explanations and cultural context powered by AI.' },
    { icon: 'sparkle', title: 'AI-Driven Insights', description: 'Leverages advanced AI to analyze audio and provide rich lyrical data.' },
  ];

  return (
    <section className="w-full max-w-3xl mb-6 p-6 bg-slate-800/60 backdrop-blur-md rounded-xl shadow-xl">
      <h2 className="text-xl font-bold text-center text-sky-300 mb-5 flex items-center justify-center">
        <Icon name="info" weight="fill" className="mr-3 text-purple-400" size="lg" />
        Welcome to Babelback
      </h2>
      <div className="grid sm:grid-cols-2 gap-5">
        {features.map((feature, index) => (
          <div key={index} className="bg-slate-700/70 p-4 rounded-lg shadow-md transition-all hover:shadow-purple-500/30 hover:ring-1 hover:ring-purple-500">
            <div className="flex items-center mb-2">
              <Icon name={feature.icon} weight="duotone" className="text-purple-400 mr-3" size="xl" />
              <h3 className="text-md font-semibold text-slate-100">{feature.title}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-5 text-center">
        Babelback aims to make music more accessible and understandable across linguistic boundaries.
      </p>
    </section>
  );
};

export default AboutBabelback;
