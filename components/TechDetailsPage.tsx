
import React from 'react';
import Icon from './Icon';
import EchoTester from './EchoTester';
import { DEFAULT_MODEL_ID, AVAILABLE_MODELS } from '../constants'; // Import model constants

interface TechDetailsPageProps {
  onNavigateBack: () => void;
}

const TechDetailsPage: React.FC<TechDetailsPageProps> = ({ onNavigateBack }) => {
  const defaultModelInfo = AVAILABLE_MODELS.find(m => m.id === DEFAULT_MODEL_ID);
  const defaultModelName = defaultModelInfo ? defaultModelInfo.name : DEFAULT_MODEL_ID;

  return (
    <div className="w-full max-w-3xl bg-slate-800/70 backdrop-blur-md p-6 md:p-8 rounded-xl shadow-2xl my-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-sky-300">Tech Details (Simple)</h1>
        <button
          onClick={onNavigateBack}
          className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm flex items-center"
        >
          <Icon name="arrow-left" className="mr-2" /> Back to App
        </button>
      </div>

      {/* How it works */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-purple-300 mb-3 flex items-center">
          <Icon name="map-trifold" weight="duotone" className="mr-3 text-purple-400" size="lg" />
          How It Works
        </h2>
        <ol className="list-decimal list-inside text-slate-300 space-y-2 pl-2">
          <li><strong>Choose source:</strong> Paste a YouTube link or upload an audio file.</li>
          <li><strong>We fetch the audio:</strong> For YouTube, a small cloud worker grabs the audio track and stores it safely.</li>
          <li><strong>AI analyzes the song:</strong> Gemini (<em>{defaultModelName}</em> by default) transcribes lyrics, translates them, and adds timings.</li>
          <li><strong>See it in sync:</strong> Verses light up as the song plays. Karaoke Mode highlights phrases.</li>
          <li><strong>Practice:</strong> Record a verse and get feedback on pronunciation, timing, and clarity.</li>
        </ol>
      </section>

      {/* What we use */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-teal-300 mb-3 flex items-center">
          <Icon name="cpu" weight="duotone" className="mr-3 text-teal-400" size="lg" />
          What’s under the hood
        </h2>
        <ul className="list-disc list-inside text-slate-300 space-y-2 pl-2">
          <li><strong>React + TypeScript:</strong> For a fast, reliable UI.</li>
          <li><strong>Gemini models:</strong> You pick the model; we default to <em>{defaultModelName}</em>.</li>
          <li><strong>Local library:</strong> Your saved songs live in your browser (IndexedDB).</li>
          <li><strong>Private links:</strong> When needed, we use short‑lived, signed links to fetch audio securely.</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-indigo-300 mb-3 flex items-center">
          <Icon name="chat-circle-dots" weight="duotone" className="mr-3 text-indigo-400" size="lg" />
          FAQ
        </h2>
        <div className="space-y-4 text-slate-300">
          <div>
            <p className="font-semibold">Why does analysis sometimes take longer?</p>
            <p className="text-sm text-slate-400">Longer songs, busy networks, or a tricky lyric structure can slow things down. You’ll see progress messages; a quick retry usually helps if it stalls.</p>
          </div>
          <div>
            <p className="font-semibold">Where is my audio stored?</p>
            <p className="text-sm text-slate-400">Uploads are analyzed by the AI and results are saved locally in your browser unless you choose to keep the audio in your library. YouTube audio is fetched by a cloud worker and accessed via short‑lived, private links.</p>
          </div>
          <div>
            <p className="font-semibold">Which audio formats work best?</p>
            <p className="text-sm text-slate-400">For YouTube we prefer m4a. Local uploads can be common formats like mp3/m4a; we’ll try to handle what you give us.</p>
          </div>
          <div>
            <p className="font-semibold">Can I change the model or translation language later?</p>
            <p className="text-sm text-slate-400">Yes. Pick a different model or language and re‑run analysis. Pro is thorough; Flash is speedy.</p>
          </div>
          <div>
            <p className="font-semibold">Does the coach judge pitch?</p>
            <p className="text-sm text-slate-400">No. It focuses on pronunciation, timing, and clarity — not pitch.</p>
          </div>
          <div>
            <p className="font-semibold">What does “Babelback” mean?</p>
            <p className="text-sm text-slate-400">It blends “Babel Fish” (universal translation from sci‑fi) and “humpback” (whales famous for songs). In short: translating songs back to you.</p>
          </div>
        </div>
      </section>

      <EchoTester />
    </div>
  );
};

export default TechDetailsPage;
