import type { Verse } from '@/types'

export function makeVerses(count: number): Verse[] {
  const verses: Verse[] = []
  for (let i = 0; i < count; i++) {
    verses.push({
      verseNumber: i + 1,
      original: `Line ${i + 1}`,
      transliteration: `Translit ${i + 1}`,
      translation: `Translation ${i + 1}`,
      meaning: `Meaning ${i + 1}`,
      startTime: i * 5,
      endTime: i * 5 + 4.5,
    } as Verse)
  }
  return verses
}

