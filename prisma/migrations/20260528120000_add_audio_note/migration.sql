-- AudioNote was in schema.prisma but never migrated; AI chat prepare step queries this table.
CREATE TABLE IF NOT EXISTS "AudioNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audioUrl" TEXT,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AudioNote_userId_status_idx" ON "AudioNote"("userId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AudioNote_userId_fkey'
  ) THEN
    ALTER TABLE "AudioNote"
      ADD CONSTRAINT "AudioNote_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
