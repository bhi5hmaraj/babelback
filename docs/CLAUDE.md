# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Setup:**
```bash
npm install
```

**Development:**
```bash
npm run dev      # Start development server
npm run build    # Build for production  
npm run preview  # Preview production build
```

**Environment:**
- Set `GEMINI_API_KEY` in `.env.local` for Gemini API access
- Uses Vite for bundling and development

## Architecture Overview

**Babelback** is a React-based AI-powered lyric explorer that processes audio files to extract, translate, and provide karaoke-style synchronized lyrics using Google's Gemini AI.

### Core Application Flow
1. **Audio Processing**: Upload audio → Gemini AI transcribes/analyzes → Extract verses with timing
2. **Multi-language Support**: Translate/transliterate lyrics between supported languages (English, Hindi, Tamil, Telugu, Bengali)
3. **Karaoke Mode**: Word-by-word synchronized display with audio playback timing
4. **Practice Mode**: Record user singing attempts and get AI feedback scores
5. **Library Management**: Store processed songs in IndexedDB for offline access

### Key Architectural Components

**State Management Pattern:**
- Custom hooks manage complex state domains (`useSongDataManager`, `useAudioPlaybackManager`, `useSingingPractice`)
- Each hook encapsulates related state and operations
- Main App.tsx orchestrates hook interactions

**Audio Processing Pipeline:**
- `geminiService.ts` → Gemini AI integration for transcription/analysis
- `useSongDataManager` → Handles audio file processing and song data
- `useAudioPlaybackManager` → Manages playback timing and verse synchronization
- `db.ts` → IndexedDB persistence layer

**Device Integration:**
- `useDeviceManager` → Audio input/output device selection and permissions
- WebAudio API integration for practice mode recording

**Core Data Models:**
- `SongData` → Complete song with verses, timing, translations
- `Verse` → Individual verse with original/translated text + timing segments
- `LibraryEntry` → Persisted song with metadata and audio blob
- `SingingScore` → AI feedback for practice mode attempts

### Key Files Structure
- `/hooks/` → Custom React hooks for state management
- `/components/` → React UI components
- `/services/` → External API integrations (Gemini)
- `types.ts` → TypeScript interfaces and enums
- `db.ts` → IndexedDB operations
- `constants.ts` → App configuration and supported languages

### Development Notes
- Uses React 19 with TypeScript
- No external state management library (uses React hooks pattern)
- Heavy use of refs for audio elements and timing
- Practice mode requires microphone permissions
- Vite handles environment variable injection for API keys