CREATE TABLE "plan_supplementary_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"name" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_weeks" ADD COLUMN "supplementary" jsonb;--> statement-breakpoint
ALTER TABLE "plan_supplementary_completions" ADD CONSTRAINT "plan_supplementary_completions_week_id_plan_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."plan_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_supp_completions_week_id" ON "plan_supplementary_completions" USING btree ("week_id");