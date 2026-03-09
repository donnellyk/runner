CREATE TABLE "activity_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"distance_start" double precision NOT NULL,
	"distance_end" double precision,
	"content" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_distance_end" CHECK ("activity_notes"."distance_end" IS NULL OR "activity_notes"."distance_end" > "activity_notes"."distance_start")
);
--> statement-breakpoint
ALTER TABLE "activity_notes" ADD CONSTRAINT "activity_notes_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_notes_activity_id" ON "activity_notes" USING btree ("activity_id");