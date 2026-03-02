ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
