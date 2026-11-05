import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSongAnalyzer } from './gemini.ts';
import type { GeminiClient } from './gemini.ts';

const song = {
  title: 'Test song', originalLanguage: 'English', summary: 'A greeting', detailedAnalysis: 'A greeting song',
  verses: [{ verseNumber: 1, original: 'Hello', translation: 'Hello', transliteration: 'Heh-loh',
    meaning: 'A greeting', startTime: 0, endTime: 2 }],
};
const input = {
  storageKey: 'uploads/test', title: 'Test song', contentType: 'audio/mpeg', language: 'English',
  model: 'gemini-2.5-flash', karaoke: false,
};

function fakeGemini(text: string, state: 'ACTIVE' | 'FAILED' | 'PROCESSING' = 'ACTIVE') {
  const uploaded = new Set<string>();
  const client: GeminiClient = {
    files: {
      upload: async ({ file }) => {
        assert.ok(file instanceof Blob && file.size > 0);
        uploaded.add('files/test');
        return { name: 'files/test', uri: 'https://gemini.test/audio', state };
      },
      get: async () => ({ name: 'files/test', uri: 'https://gemini.test/audio', state: 'ACTIVE' }),
      delete: async ({ name }) => { uploaded.delete(name); },
    },
    models: {
      generateContent: async ({ contents, config }) => {
        assert.ok(JSON.stringify(contents).includes('https://gemini.test/audio'));
        assert.ok(config?.responseSchema);
        return { text };
      },
    },
  };
  return { client, uploaded };
}

const storage = { read: async () => new Blob(['audio'], { type: 'audio/mpeg' }) };

test('analysis returns validated lyrics after the uploaded audio is ready', async () => {
  const fake = fakeGemini(JSON.stringify(song), 'PROCESSING');
  const analyze = createSongAnalyzer(fake.client, storage, async () => {});

  assert.deepEqual(await analyze(input), song);
  assert.equal(fake.uploaded.size, 0);
});

test('malformed model output fails and releases its uploaded audio', async () => {
  for (const text of ['not json', JSON.stringify({ title: 'Missing lyrics' })]) {
    const fake = fakeGemini(text);
    await assert.rejects(createSongAnalyzer(fake.client, storage)(input));
    assert.equal(fake.uploaded.size, 0);
  }
});

test('audio processing failure releases the file without producing a song', async () => {
  const fake = fakeGemini(JSON.stringify(song), 'FAILED');

  await assert.rejects(createSongAnalyzer(fake.client, storage)(input), /could not process/);
  assert.equal(fake.uploaded.size, 0);
});

test('models outside the server allowlist are rejected before accessing audio', async () => {
  const fake = fakeGemini(JSON.stringify(song));
  const analyze = createSongAnalyzer(fake.client, {
    read: async () => { throw new Error('Audio must remain unread'); },
  });

  await assert.rejects(analyze({ ...input, model: 'untrusted-model' }), /Unsupported analysis model/);
});
