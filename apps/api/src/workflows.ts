import type { Context } from 'hono';
import { Inngest } from 'inngest';
import { serve } from 'inngest/hono';
import { z } from 'zod';
import { failJob, redispatchAnalysisJobs, runAnalysis } from './analysis.ts';
import type { AnalysisService } from './analysis.ts';
import type { Db } from './db.ts';
import { ANALYSIS_MODELS, connectSongAnalyzer } from './gemini.ts';
import type { Storage } from './storage.ts';

type WorkflowConfig = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL_ID?: string;
  INNGEST_EVENT_KEY?: string;
  INNGEST_SIGNING_KEY?: string;
};

export function connectWorkflows(db: Db, storage: Storage, config: WorkflowConfig, production: boolean) {
  const model = config.GEMINI_MODEL_ID;
  if (!config.GEMINI_API_KEY || !model || !ANALYSIS_MODELS.some((allowed) => allowed === model)) return {};
  if (production && (!config.INNGEST_EVENT_KEY || !config.INNGEST_SIGNING_KEY)) return {};
  const analyze = connectSongAnalyzer(config.GEMINI_API_KEY, storage);
  const inngest = new Inngest({
    id: 'babelback', eventKey: config.INNGEST_EVENT_KEY, signingKey: config.INNGEST_SIGNING_KEY,
    isDev: !production,
  });
  const analyzeSong = inngest.createFunction({
    id: 'song-analyze', triggers: [{ event: 'song/analyze.requested' }], retries: 3,
    concurrency: { limit: 2, key: 'event.data.userId' },
    throttle: { limit: 6, period: '1m', key: 'event.data.userId' },
    onFailure: async ({ event, error }) => {
      const jobId = z.uuid().parse(event.data.event.data.jobId);
      console.error('Analysis exhausted retries', { jobId, error });
      await failJob(db, jobId);
    },
  }, async ({ event, step, runId }) => {
    const jobId = z.uuid().parse(event.data.jobId);
    await step.run('analyse-and-save', () => runAnalysis(db, analyze, jobId, runId));
    return { jobId };
  });
  const analysis: AnalysisService = { model, analyze,
    send: ({ jobId, userId }) => inngest.send({ id: jobId, name: 'song/analyze.requested', data: { jobId, userId } }),
  };
  const recoverQueued = inngest.createFunction({
    id: 'recover-queued-analysis', triggers: [{ cron: '* * * * *' }], concurrency: 1,
  }, async ({ step }) => {
    await step.run('dispatch-queued', () => redispatchAnalysisJobs(db, analysis.send));
  });
  const handler: (c: Context) => Promise<Response> = serve({ client: inngest, functions: [analyzeSong, recoverQueued] });
  return { analysis, inngestHandler: handler };
}
