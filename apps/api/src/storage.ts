import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  signedPutUrl(key: string, contentType: string, bytes: number): Promise<string>;
  head(key: string): Promise<{ bytes: number; contentType: string }>;
  read(key: string): Promise<Blob>;
};

export function connectStorage(env: StorageEnv): Storage {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const object = { Bucket: env.S3_BUCKET };

  return {
    signedUrl: (key) =>
      getSignedUrl(client, new GetObjectCommand({ ...object, Key: key }), { expiresIn: SIGNED_URL_SECONDS }),
    signedPutUrl: (key, contentType, bytes) =>
      getSignedUrl(client, new PutObjectCommand({
        ...object, Key: key, ContentType: contentType, ContentLength: bytes,
      }), { expiresIn: 15 * 60, signableHeaders: new Set(['content-type', 'content-length']) }),
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
