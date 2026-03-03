#!/bin/sh
set -e

echo "Running migrations..."
cd /app/packages/db
npx tsx src/migrate.ts
cd /app/apps/web

echo "Starting web server..."
exec node build
