ALTER TABLE "FileAsset" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'READY';
ALTER TABLE "FileAsset" ADD COLUMN "retentionUntil" DATETIME;

CREATE UNIQUE INDEX "FileAsset_idempotencyKey_key" ON "FileAsset"("idempotencyKey");
CREATE INDEX "FileAsset_ownerUserId_createdAt_idx" ON "FileAsset"("ownerUserId", "createdAt");
CREATE INDEX "FileAsset_deviceId_createdAt_idx" ON "FileAsset"("deviceId", "createdAt");
