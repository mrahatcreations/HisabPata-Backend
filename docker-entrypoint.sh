#!/bin/sh
set -e

echo "Resolving the accidentally skipped migration..."
npx prisma migrate resolve --rolled-back 20260612034934_add_invited_by_id 2>/dev/null || true

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec "$@"
