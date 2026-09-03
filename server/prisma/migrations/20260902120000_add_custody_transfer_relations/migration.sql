-- AlterTable Evidence
ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "currentCustodianId" TEXT;

-- Backfill currentCustodianId from collectedById
UPDATE "Evidence" SET "currentCustodianId" = "collectedById" WHERE "currentCustodianId" IS NULL;

-- AlterTable CustodyEvent
ALTER TABLE "CustodyEvent" ADD COLUMN IF NOT EXISTS "fromUserId" TEXT;
ALTER TABLE "CustodyEvent" ADD COLUMN IF NOT EXISTS "toUserId" TEXT;
ALTER TABLE "CustodyEvent" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Evidence_currentCustodianId_idx" ON "Evidence"("currentCustodianId");
CREATE INDEX IF NOT EXISTS "CustodyEvent_fromUserId_idx" ON "CustodyEvent"("fromUserId");
CREATE INDEX IF NOT EXISTS "CustodyEvent_toUserId_idx" ON "CustodyEvent"("toUserId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Evidence_currentCustodianId_fkey') THEN
    ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_currentCustodianId_fkey" FOREIGN KEY ("currentCustodianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustodyEvent_fromUserId_fkey') THEN
    ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustodyEvent_toUserId_fkey') THEN
    ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
