CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"source" text DEFAULT 'strava' NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"sport_type" text NOT NULL,
	"workout_type" text,
	"distance" double precision,
	"moving_time" integer,
	"elapsed_time" integer,
	"total_elevation_gain" double precision,
	"start_date" timestamp with time zone NOT NULL,
	"start_latlng" double precision[],
	"end_latlng" double precision[],
	"average_speed" double precision,
	"max_speed" double precision,
	"average_heartrate" double precision,
	"max_heartrate" double precision,
	"average_cadence" double precision,
	"average_watts" double precision,
	"has_heartrate" boolean DEFAULT false NOT NULL,
	"has_power" boolean DEFAULT false NOT NULL,
	"device_name" text,
	"gear_id" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"route" geometry(LineString, 4326),
	"source_raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_laps" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"lap_index" integer NOT NULL,
	"elapsed_time" integer,
	"moving_time" integer,
	"distance" double precision,
	"start_date" timestamp with time zone,
	"total_elevation_gain" double precision,
	"average_speed" double precision,
	"max_speed" double precision,
	"average_heartrate" double precision,
	"max_heartrate" double precision,
	"average_cadence" double precision,
	"average_watts" double precision
);
--> statement-breakpoint
CREATE TABLE "activity_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"segment_index" integer NOT NULL,
	"route" geometry(LineString, 4326),
	"distance_start" double precision NOT NULL,
	"distance_end" double precision NOT NULL,
	"duration" integer,
	"avg_pace" double precision,
	"min_pace" double precision,
	"max_pace" double precision,
	"avg_heartrate" double precision,
	"min_heartrate" double precision,
	"max_heartrate" double precision,
	"avg_cadence" double precision,
	"min_cadence" double precision,
	"max_cadence" double precision,
	"avg_power" double precision,
	"min_power" double precision,
	"max_power" double precision,
	"elevation_gain" double precision,
	"elevation_loss" double precision
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"activity_id" integer NOT NULL,
	"stream_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"original_size" integer,
	"resolution" text,
	CONSTRAINT "activity_streams_activity_id_stream_type_pk" PRIMARY KEY("activity_id","stream_type")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_laps" ADD CONSTRAINT "activity_laps_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_activities_source_external_id" ON "activities" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "idx_activities_user_id" ON "activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activities_start_date" ON "activities" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "idx_activities_sync_status" ON "activities" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_activities_sport_type" ON "activities" USING btree ("sport_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_activity_laps_activity_lap" ON "activity_laps" USING btree ("activity_id","lap_index");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_activity_segments_activity_segment" ON "activity_segments" USING btree ("activity_id","segment_index");--> statement-breakpoint
CREATE INDEX "idx_activity_segments_activity_id" ON "activity_segments" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_segments_avg_pace" ON "activity_segments" USING btree ("avg_pace");--> statement-breakpoint
CREATE INDEX "idx_activity_segments_avg_heartrate" ON "activity_segments" USING btree ("avg_heartrate");--> statement-breakpoint
CREATE INDEX "idx_activities_route" ON "activities" USING GIST ("route");--> statement-breakpoint
CREATE INDEX "idx_activity_segments_route" ON "activity_segments" USING GIST ("route");