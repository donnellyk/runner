#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="backup-${TIMESTAMP}.sql.gz"

echo "Backing up database..."
docker compose exec -T postgres pg_dump -U postgres webrunner | gzip > "$BACKUP_FILE"
echo "Created $BACKUP_FILE"

if command -v b2 &> /dev/null; then
  echo "Uploading to B2..."
  b2 upload-file web-runner-backups "$BACKUP_FILE" "backups/$BACKUP_FILE"
  echo "Upload complete."
else
  echo "b2 CLI not found. Upload manually:"
  echo "  b2 upload-file <bucket> $BACKUP_FILE backups/$BACKUP_FILE"
fi
