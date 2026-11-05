import { GetObjectCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const SIGNED_URL_SECONDS = 2 * 60 * 60;

type StorageEnv = {
  S3_BUCKET: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
};

export type Storage = {
  signedUrl(key: string): Promise<string>;
  // Without bytes the size is unsigned, for a downloader that learns it while writing; check it with head.
  signedPutUrl(key: string, contentType: string, bytes?: number): Promise<string>;
  head(key: string): Promise<{ bytes: number; contentType: string }>;
  read(key: string): Promise<Blob>;
};

const s3 = (env: StorageEnv) => new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  // The browser supplies the body after signing, so its checksum is not known here.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

// Browsers PUT uploads and recordings straight to signed URLs. Without this rule the
// preflight gets no CORS headers and the upload fails with "Failed to fetch".
export async function allowBrowserUploads(env: StorageEnv, origin: string) {
  await s3(env).send(new PutBucketCorsCommand({ Bucket: env.S3_BUCKET, CORSConfiguration: { CORSRules: [
    { AllowedOrigins: [origin], AllowedMethods: ['PUT'], AllowedHeaders: ['content-type'], MaxAgeSeconds: 3600 },
  ] } }));
}

export function connectStorage(env: StorageEnv): Storage {
  const client = s3(env);
  const object = { Bucket: env.S3_BUCKET };

  return {
    signedUrl: (key) =>
      getSignedUrl(client, new GetObjectCommand({ ...object, Key: key }), { expiresIn: SIGNED_URL_SECONDS }),
    signedPutUrl: (key, contentType, bytes) =>
      getSignedUrl(client, new PutObjectCommand({
        ...object, Key: key, ContentType: contentType, ContentLength: bytes,
      }), { expiresIn: 15 * 60, signableHeaders: new Set(bytes === undefined ? ['content-type'] : ['content-type', 'content-length']) }),
    head: async (key) => {
      const found = await client.send(new HeadObjectCommand({ ...object, Key: key }));
      return { bytes: found.ContentLength ?? 0, contentType: found.ContentType ?? 'application/octet-stream' };
    },
    read: async (key) => {
      const found = await client.send(new GetObjectCommand({ ...object, Key: key }));
      if (!found.Body) throw new Error('Audio object has no body');
      return new Blob([new Uint8Array(await found.Body.transformToByteArray())], { type: found.ContentType });
    },
  };
}
