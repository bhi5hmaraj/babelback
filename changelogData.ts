
import { ChangelogEntry } from './types';

// Helper to get current date in a nice format, e.g., "July 26, 2024"
const getCurrentFormattedDate = (): string => {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: 'June 13, 2025',
    title: 'Verse Display Reimagined & Smoother Scrolling',
    description: [
      'Revamped the verse display: Transliteration and translation lines now appear vertically, one below the other, for improved readability, especially on mobile devices.',
      'Enhanced auto-scrolling for lyrics during playback: Scrolling is now more preemptive, aiming to keep the active line comfortably in view within its container.',
      'Each transliteration/translation line pair is now visually grouped with a border for better separation.',
      'The currently active verse display section now has a distinct highlight border to make it stand out.',
      'Adjusted the lyrics scroll container to use a dynamic maximum height (45% of viewport height) for better responsiveness across screen sizes.',
    ],
  },
  {
    version: '1.0.0',
    date: 'June 10, 2025', // Assuming a static date for the initial entry for consistency in example
    title: 'Hello Babelback! Changelog Introduced!',
    description: [
      'Added this "Changelog" section to keep you updated on all the new features, improvements, and bug fixes in Babelback.',
      'You can now access the changelog from the main header navigation.',
      'Enhanced various UI elements for better clarity and aesthetics.',
      'Improved error handling for API key and audio device selection.',
    ],
  },
  // Add more entries here as new features are released, newest first
  // Example:
  // {
  //   version: '0.9.0',
  //   date: 'July 20, 2024',
  //   title: 'Feature: Singing Practice Mode',
  //   description: [
  //     'Launched Singing Practice Mode! Record yourself and get AI feedback.',
  //     'Added earphone consent modal for better recording quality.',
  //     'Integrated detailed score display for practice attempts.',
  //   ],
  // },
];
