import { z } from 'zod';

export const env = z
  .object({
    DATABASE_URL: z.string().startsWith('postgres'),
    ADMIN_PASSWORD: z.string().min(16),
    PORT: z.coerce.number().int().default(3000),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
  })
  .parse(process.env);
