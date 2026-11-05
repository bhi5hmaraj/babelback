import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  head(key: string): Promise<{ bytes: number; contentType: string }>;
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
    head: async (key) => {
      const found = await client.send(new HeadObjectCommand({ ...object, Key: key }));
      return { bytes: found.ContentLength ?? 0, contentType: found.ContentType ?? 'application/octet-stream' };
    },
  };
}
