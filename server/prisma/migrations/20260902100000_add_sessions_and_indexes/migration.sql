-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey'
    ) THEN
        ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Indexes for performance & query optimization
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "Case_status_idx" ON "Case"("status");
CREATE INDEX IF NOT EXISTS "Case_leadUserId_idx" ON "Case"("leadUserId");
CREATE INDEX IF NOT EXISTS "Case_createdAt_idx" ON "Case"("createdAt");
CREATE INDEX IF NOT EXISTS "Evidence_status_idx" ON "Evidence"("status");
CREATE INDEX IF NOT EXISTS "Evidence_collectedById_idx" ON "Evidence"("collectedById");
CREATE INDEX IF NOT EXISTS "Evidence_storageKey_idx" ON "Evidence"("storageKey");
CREATE INDEX IF NOT EXISTS "CustodyEvent_actorUserId_idx" ON "CustodyEvent"("actorUserId");
CREATE INDEX IF NOT EXISTS "CustodyEvent_action_idx" ON "CustodyEvent"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_timestamp_idx" ON "AuditLog"("actorUserId", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
