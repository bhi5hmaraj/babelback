CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('youtube_ingest', 'analyze', 'practice_score');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('signup_grant', 'purchase', 'spend', 'refund', 'admin');--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"job_id" uuid,
	"payment_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_paymentEventId_unique" UNIQUE("payment_event_id"),
	CONSTRAINT "credit_ledger_jobId_reason_unique" UNIQUE("job_id","reason")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"input" jsonb NOT NULL,
	"youtube_id" text,
	"asset_id" uuid,
	"analysis_id" uuid,
	"inngest_run_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"preferred_language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_entries_userId_assetId_unique" UNIQUE("user_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"job_id" uuid,
	"first_verse" integer NOT NULL,
	"last_verse" integer NOT NULL,
	"recording_key" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"score" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"theme" text,
	"accent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_credit_balance_non_negative" CHECK ("users"."credit_balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_non_negative";--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "youtube_id" text;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "artist" text;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "ready_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_asset_id_audio_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_asset_id_audio_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_asset_id_audio_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_one_signup_grant" ON "credit_ledger" USING btree ("user_id") WHERE "credit_ledger"."reason" = 'signup_grant';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_active_youtube" ON "jobs" USING btree ("user_id","youtube_id") WHERE "jobs"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "trial_grant_credits";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "anonymous_users_per_ip_per_day";--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_youtubeId_unique" UNIQUE("youtube_id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_non_negative" CHECK (least("settings"."practice_score_credits", "settings"."analysis_credits", "settings"."youtube_import_credits",
        "settings"."signup_grant_credits", "settings"."max_song_seconds", "settings"."max_upload_mb") >= 0);