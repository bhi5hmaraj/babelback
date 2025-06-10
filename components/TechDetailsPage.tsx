import React from 'react';
import Icon from './Icon';
import { GEMINI_MODEL_TEXT } from '../constants';

interface TechDetailsPageProps {
  onNavigateBack: () => void;
}

const TechDetailsPage: React.FC<TechDetailsPageProps> = ({ onNavigateBack }) => {
  return (
    <div className="w-full max-w-3xl bg-slate-800/70 backdrop-blur-md p-6 md:p-8 rounded-xl shadow-2xl my-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-sky-300">Technical Details</h1>
        <button
          onClick={onNavigateBack}
          className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm flex items-center"
        >
          <Icon name="arrow-left" className="mr-2" /> Back to App
        </button>
      </div>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-purple-300 mb-3 flex items-center">
          <Icon name="cpu" weight="duotone" className="mr-3 text-purple-400" size="lg" />
          Core Technologies
        </h2>
        <ul className="list-disc list-inside text-slate-300 space-y-2 pl-2">
          <li><strong>Frontend:</strong> Built with <a href="https://react.dev/" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">React</a> and <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">TypeScript</a> for a robust, type-safe, and modern user interface.</li>
          <li><strong>Styling:</strong> <a href="https://tailwindcss.com/" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Tailwind CSS</a> is used for rapid UI development and a consistent, utility-first styling approach.</li>
          <li><strong>AI Engine:</strong> Powered by Google's <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Gemini API</a> (specifically using the <code>{GEMINI_MODEL_TEXT}</code> model via the <code>@google/genai</code> SDK) for all audio analysis, transcription, translation, lyrical interpretation, and singing practice feedback.</li>
          <li><strong>Client-Side Storage:</strong> <a href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">IndexedDB</a> is utilized to store your personal song library directly in your browser, enabling offline access to previously processed songs.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-teal-300 mb-3 flex items-center">
          <Icon name="list-checks" weight="duotone" className="mr-3 text-teal-400" size="lg" />
          High-Level Workflow
        </h2>
        <ol className="list-decimal list-inside text-slate-300 space-y-2 pl-2">
          <li><strong>Device Configuration & Audio Upload:</strong> Users select preferred audio input/output devices. An audio file is uploaded by the user.</li>
          <li>
            <strong>AI Processing (Gemini API):</strong>
            <ul className="list-circle list-inside pl-4 mt-1 text-sm text-slate-400 space-y-1">
              <li>The audio is securely processed by the Gemini API.</li>
              <li>The AI transcribes original lyrics, detects the language, and segments the song into verses with precise timings.</li>
              <li>Lyrics are translated into the user's target language.</li>
              <li>Phonetic transliterations are generated (customized for English speakers or in the target language's native script).</li>
              <li>Verse-by-verse meanings, song summaries, and detailed analyses are created.</li>
              <li>If Karaoke Mode is active, word-by-word timings for transliteration and translation are generated.</li>
            </ul>
          </li>
          <li><strong>Interactive Display:</strong> The structured data from the AI is presented to the user, synchronized with audio playback for an engaging experience.</li>
          <li>
            <strong>Singing Practice Mode:</strong>
             <ul className="list-circle list-inside pl-4 mt-1 text-sm text-slate-400 space-y-1">
                <li>Users can record themselves singing selected verses.</li>
                <li>The recording and reference lyrics are sent to the Gemini API for analysis.</li>
                <li>The AI provides verse-by-verse feedback on pronunciation, timing, and vocal clarity, along with an overall performance score.</li>
            </ul>
          </li>
          <li><strong>Local Library Management:</strong> Processed songs, along with their AI-generated data and audio, can be saved to and loaded from the browser's IndexedDB.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-indigo-300 mb-3 flex items-center">
          <Icon name="code-block" weight="duotone" className="mr-3 text-indigo-400" size="lg" />
          Design Philosophy & Key Aspects
        </h2>
        <ul className="list-disc list-inside text-slate-300 space-y-2 pl-2">
          <li><strong>User Experience Focus:</strong> Prioritizing an intuitive, responsive, and enjoyable interface.</li>
          <li><strong>Real-Time Interaction:</strong> Synchronized lyrics and dynamic updates enhance engagement.</li>
          <li><strong>Cutting-Edge AI:</strong> Leveraging the power of Gemini for deep, nuanced lyrical insights and feedback.</li>
          <li><strong>Privacy-Conscious:</strong> The API key is handled as an environment variable. Song library data is stored locally in the user's browser.</li>
          <li><strong>Offline Capability:</strong> Saved library songs are accessible without an internet connection (once processed and saved).</li>
          <li><strong>Modularity & Maintainability:</strong> Code is structured using React functional components and custom hooks for better organization.</li>
        </ul>
      </section>
    </div>
  );
};

export default TechDetailsPage;
