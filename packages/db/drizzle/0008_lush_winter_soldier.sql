CREATE TABLE "terminal_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"encoded" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal_layouts" ADD CONSTRAINT "terminal_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_terminal_layouts_user_id" ON "terminal_layouts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_terminal_layouts_user_default" ON "terminal_layouts" USING btree ("user_id") WHERE "terminal_layouts"."is_default" = true;