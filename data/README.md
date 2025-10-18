# Seed Data

This directory contains seed data for pre-populating the Redis analysis cache.

## Seed Songs Format

The `seed-songs.json` file should contain an array of seed entries:

```json
[
  {
    "gcsObject": {
      "bucket": "babelback-audio",
      "path": "seeds/hindi/vande-mataram.m4a",
      "contentType": "audio/mp4",
      "size": 3456789
    },
    "targetLanguage": "Hindi",
    "modelId": "gemini-2.0-flash-exp",
    "karaokeMode": true,
    "youtubeUrl": "https://youtube.com/watch?v=XXXXX",
    "youtubeId": "XXXXX",
    "notes": "Classic patriotic song - good for testing Hindi",
    "tags": ["hindi", "patriotic", "classic"],
    "qualityTier": "seed",
    "songData": {
      "title": "Vande Mataram",
      "originalLanguage": "Hindi",
      "summary": "Patriotic song about motherland...",
      "detailedAnalysis": "This song...",
      "verses": [
        {
          "id": "v1",
          "startTime": 0,
          "endTime": 15.5,
          "originalText": "वंदे मातरम्",
          "transliteratedText": "Vande Mataram",
          "translatedText": "I bow to thee, Mother",
          "meaning": "Expression of reverence...",
          "transliterationSegments": [
            { "text": "Vande", "startTime": 0, "endTime": 1.2 },
            { "text": "Mataram", "startTime": 1.2, "endTime": 2.5 }
          ],
          "translationSegments": [
            { "text": "I bow to thee", "startTime": 0, "endTime": 1.5 },
            { "text": "Mother", "startTime": 1.5, "endTime": 2.5 }
          ]
        }
      ]
    }
  }
]
```

## Required Fields

- `gcsObject.bucket` - GCS bucket name
- `gcsObject.path` - Object path within bucket (should start with `seeds/`)
- `targetLanguage` - Target language for translation (English, Hindi, Tamil, Telugu, Bengali)
- `modelId` - Gemini model ID used for analysis
- `karaokeMode` - Whether karaoke mode was enabled (word-level timing)
- `songData` - Complete song analysis data (see SongData type in types.ts)

## Optional Fields

- `gcsObject.contentType` - MIME type (e.g., "audio/mp4")
- `gcsObject.size` - File size in bytes
- `youtubeUrl` - Source YouTube URL if applicable
- `youtubeId` - Extracted YouTube video ID
- `notes` - Human-readable notes about this seed
- `tags` - Array of tags for categorization
- `qualityTier` - Quality rating: "seed", "high", "medium", "low"

## Running the Seed Script

To populate Redis cache with seed data:

```bash
npm run seed-cache

# Or with custom seed file:
npx tsx scripts/seed-analysis-cache.ts path/to/custom-seeds.json
```

The script will:
1. Read the seed file
2. Validate each entry
3. Store in Redis with no expiration (permanent cache)
4. Log success/failure for each entry

## Creating Seed Files

1. Analyze a song normally using the app
2. Copy the GCS object details and songData from the response
3. Add to seed-songs.json with appropriate metadata
4. Ensure the audio file exists at the specified GCS path
5. Run the seed script to populate cache

## Seed File Storage

Seed audio files should be stored in GCS under the `seeds/` prefix with this structure:

```
seeds/
  hindi/
    song1.m4a
    song2.m4a
  tamil/
    song1.m4a
  telugu/
    song1.m4a
```

This structure:
- Makes seeds easily identifiable
- Allows language-specific organization
- Prevents conflicts with temporary downloads
