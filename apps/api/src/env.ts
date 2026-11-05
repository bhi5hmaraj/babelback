import { z } from 'zod';

// Keys for paid features are optional: without one the api still serves seeds,
// and the feature answers 503.
const key = z.string().min(1).optional();

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
    CLERK_SECRET_KEY: key,
    CLERK_WEBHOOK_SIGNING_SECRET: key,
    GEMINI_API_KEY: key,
    GEMINI_MODEL_ID: key,
    INNGEST_EVENT_KEY: key,
    INNGEST_SIGNING_KEY: key,
    APIFY_TOKEN: key,
    APIFY_ACTOR_ID: key,
  })
  .parse(process.env);
