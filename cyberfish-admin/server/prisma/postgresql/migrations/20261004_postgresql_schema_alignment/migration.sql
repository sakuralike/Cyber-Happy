-- AlterTable
ALTER TABLE "AppVersion" ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "certificateSha256" TEXT;

-- AlterTable
ALTER TABLE "MlModel" ADD COLUMN     "containerVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "generation" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "manifestHash" TEXT,
ADD COLUMN     "manifestPublicKeyId" TEXT,
ADD COLUMN     "manifestSignature" TEXT,
ADD COLUMN     "manifestSignatureAlgorithm" TEXT;

-- AlterTable
ALTER TABLE "Misreport" ADD COLUMN     "snapshotAssetIds" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "videoAssetId" TEXT;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "retentionUntil" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'READY';

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_idempotencyKey_key" ON "FileAsset"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FileAsset_ownerUserId_createdAt_idx" ON "FileAsset"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FileAsset_deviceId_createdAt_idx" ON "FileAsset"("deviceId", "createdAt");
