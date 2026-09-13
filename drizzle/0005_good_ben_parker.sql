CREATE TABLE "identity_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retired_usernames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
