import { Language } from './types';

export const SUPPORTED_LANGUAGES: Language[] = [
  Language.ENGLISH,
  Language.HINDI,
  Language.TAMIL,
  Language.TELUGU,
  Language.BENGALI,
];

// This constant is overridden by the user and should be respected as the Pro model.
export const GEMINI_MODEL_PRO_OVERRIDE = 'gemini-2.5-pro-preview-06-05'; // User's Pro model
export const GEMINI_MODEL_FLASH_STANDARD = 'gemini-2.5-flash-preview-04-17'; // Standard Flash model

export const AVAILABLE_MODELS = [
  {
    id: GEMINI_MODEL_PRO_OVERRIDE,
    name: 'Gemini Pro',
    description: 'Highest quality, slower processing.'
  },
  {
    id: GEMINI_MODEL_FLASH_STANDARD,
    name: 'Gemini Flash',
    description: 'Good quality, faster processing, suitable for most tasks.'
  }
];

// Default model to use - can be user's Pro or Flash. Let's default to user's specified Pro model.
export const DEFAULT_MODEL_ID = GEMINI_MODEL_PRO_OVERRIDE;

// The original GEMINI_MODEL_TEXT constant for reference or if something hardcodes it,
// but new functionality should use the dynamic model selection.
export const GEMINI_MODEL_TEXT = GEMINI_MODEL_PRO_OVERRIDE;


export const INITIAL_PANEL_VISIBILITY = {
  lyrics: true, // Changed from 'transliteration'
  meaning: true,
};

export const AI_THOUGHTS_AND_JOKES = [
  "Hmm, this beat is catchy...",
  "Is that a high C or a D flat? The eternal question.",
  "Translating 'funky' into Elvish is harder than it looks.",
  "Calculating the optimal number of 'oohs' and 'aahs'.",
  "One moment, consulting the ancient rhyming dictionary...",
  "Pretty sure this song will be a chart-topper.",
  "The AI is currently humming along.",
  "Why did the musician break up with the music? Too much drama.",
  "What's a ghost's favorite note? Soul-Fa.",
  "Hang on, the AI is just grabbing a tiny cup of coffee.",
  "Decoding lyrical genius... or just some mumbles.",
  "Our AI says this song has 'good vibes'. Very technical.",
  "Polishing the translations... almost there!",
  "Is this song in 4/4 or 7/8? Let me count...",
  "Just double-checking if 'yeet' is a recognized lyrical term."
];