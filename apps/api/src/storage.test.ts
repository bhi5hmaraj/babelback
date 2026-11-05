import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectStorage } from './storage.ts';

test('upload signatures bind the object key, declared size and audio type', async () => {
  const storage = connectStorage({
    S3_BUCKET: 'audio', S3_ENDPOINT: 'https://bucket.test', S3_REGION: 'test',
    S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test-secret',
  });

  const url = new URL(await storage.signedPutUrl('uploads/user/song', 'audio/mpeg', 1234));

  assert.ok(url.pathname.endsWith('/uploads/user/song'));
  const headers = url.searchParams.get('X-Amz-SignedHeaders')?.split(';');
  assert.ok(headers?.includes('content-length'));
  assert.ok(headers?.includes('content-type'));
  assert.equal(url.searchParams.has('x-amz-checksum-crc32'), false);
});

test('a download signature binds the audio type and leaves the size to the completion check', async () => {
  const storage = connectStorage({
    S3_BUCKET: 'audio', S3_ENDPOINT: 'https://bucket.test', S3_REGION: 'test',
    S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test-secret',
  });

  const url = new URL(await storage.signedPutUrl('youtube/video.m4a', 'audio/mp4'));

  assert.deepEqual(url.searchParams.get('X-Amz-SignedHeaders')?.split(';').sort(), ['content-type', 'host']);
});
