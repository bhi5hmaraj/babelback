CREATE TYPE "public"."audio_source" AS ENUM('upload', 'youtube', 'seed');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"language" text NOT NULL,
	"model" text NOT NULL,
	"karaoke" boolean NOT NULL,
	"prompt_version" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_assetId_language_model_karaoke_promptVersion_unique" UNIQUE("asset_id","language","model","karaoke","prompt_version")
);
--> statement-breakpoint
CREATE TABLE "audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "audio_source" NOT NULL,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_assets_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_asset_id_audio_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE cascade ON UPDATE no action;