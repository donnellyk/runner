CREATE TABLE "plan_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer,
	"name" text NOT NULL,
	"sport_type" text NOT NULL,
	"race_distance" double precision,
	"race_date" timestamp with time zone NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"effort_map" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"sport_type" text DEFAULT 'run' NOT NULL,
	"race_distance" double precision,
	"week_count" integer NOT NULL,
	"source_yaml" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"phase" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_workout_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"match_type" text NOT NULL,
	"confidence" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_workout_matches_workout_id_unique" UNIQUE("workout_id")
);
--> statement-breakpoint
CREATE TABLE "plan_workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_distance_min" double precision,
	"target_distance_max" double precision,
	"target_duration_min" integer,
	"target_duration_max" integer,
	"effort" text,
	"targets" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_instances" ADD CONSTRAINT "plan_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_instances" ADD CONSTRAINT "plan_instances_template_id_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."plan_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_weeks" ADD CONSTRAINT "plan_weeks_instance_id_plan_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."plan_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_workout_matches" ADD CONSTRAINT "plan_workout_matches_workout_id_plan_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."plan_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_workout_matches" ADD CONSTRAINT "plan_workout_matches_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_workouts" ADD CONSTRAINT "plan_workouts_week_id_plan_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."plan_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_instances_user_id" ON "plan_instances" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plan_instances_user_active" ON "plan_instances" USING btree ("user_id") WHERE "plan_instances"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_plan_templates_user_id" ON "plan_templates" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plan_weeks_instance_week" ON "plan_weeks" USING btree ("instance_id","week_number");--> statement-breakpoint
CREATE INDEX "idx_plan_weeks_instance_start_date" ON "plan_weeks" USING btree ("instance_id","start_date");--> statement-breakpoint
CREATE INDEX "idx_plan_workout_matches_activity_id" ON "plan_workout_matches" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_plan_workouts_week_day_order" ON "plan_workouts" USING btree ("week_id","day_of_week","sort_order");