CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"practice_score_credits" integer DEFAULT 1 NOT NULL,
	"analysis_credits" integer DEFAULT 5 NOT NULL,
	"youtube_import_credits" integer DEFAULT 8 NOT NULL,
	"trial_grant_credits" integer DEFAULT 8 NOT NULL,
	"signup_grant_credits" integer DEFAULT 40 NOT NULL,
	"anonymous_users_per_ip_per_day" integer DEFAULT 3 NOT NULL,
	"max_song_seconds" integer DEFAULT 600 NOT NULL,
	"max_upload_mb" integer DEFAULT 100 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_non_negative" CHECK (least("settings"."practice_score_credits", "settings"."analysis_credits", "settings"."youtube_import_credits",
        "settings"."trial_grant_credits", "settings"."signup_grant_credits", "settings"."anonymous_users_per_ip_per_day",
        "settings"."max_song_seconds", "settings"."max_upload_mb") >= 0)
);
--> statement-breakpoint
INSERT INTO "settings" DEFAULT VALUES;
