CREATE TABLE IF NOT EXISTS "FileAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bizType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploadedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AdminUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FileAsset_bizType_idx" ON "FileAsset"("bizType");
CREATE INDEX IF NOT EXISTS "FileAsset_sha256_idx" ON "FileAsset"("sha256");

CREATE TABLE IF NOT EXISTS "AppVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "versionName" TEXT NOT NULL,
  "versionCode" INTEGER NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'ANDROID',
  "channel" TEXT NOT NULL DEFAULT 'official',
  "updateType" TEXT NOT NULL DEFAULT 'OPTIONAL',
  "releaseNotes" TEXT NOT NULL DEFAULT '',
  "apkUrl" TEXT,
  "apkSize" BIGINT,
  "apkSha256" TEXT,
  "apkFileId" TEXT,
  "minSupportedCode" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "grayPercent" INTEGER NOT NULL DEFAULT 0,
  "grayDeviceIds" TEXT NOT NULL DEFAULT '[]',
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "onlineAt" DATETIME,
  "offlineAt" DATETIME,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AppVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppVersion_versionCode_key" ON "AppVersion"("versionCode");
CREATE INDEX IF NOT EXISTS "AppVersion_status_idx" ON "AppVersion"("status");
CREATE INDEX IF NOT EXISTS "AppVersion_platform_channel_idx" ON "AppVersion"("platform", "channel");
CREATE INDEX IF NOT EXISTS "AppVersion_createdAt_idx" ON "AppVersion"("createdAt");

ALTER TABLE "AppVersion" ADD COLUMN "downloadMode" TEXT NOT NULL DEFAULT 'EXTERNAL';

UPDATE "AppVersion"
SET "apkFileId" = (
  SELECT "id"
  FROM "FileAsset"
  WHERE "FileAsset"."bizType" = 'APK'
    AND (("AppVersion"."apkSha256" IS NOT NULL AND "FileAsset"."sha256" = "AppVersion"."apkSha256")
      OR ("AppVersion"."apkUrl" IS NOT NULL AND "FileAsset"."url" = "AppVersion"."apkUrl"))
  LIMIT 1
)
WHERE "apkFileId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "FileAsset"
    WHERE "FileAsset"."bizType" = 'APK'
      AND (("AppVersion"."apkSha256" IS NOT NULL AND "FileAsset"."sha256" = "AppVersion"."apkSha256")
        OR ("AppVersion"."apkUrl" IS NOT NULL AND "FileAsset"."url" = "AppVersion"."apkUrl"))
  );

UPDATE "AppVersion"
SET "downloadMode" = 'SERVER'
WHERE "apkFileId" IS NOT NULL;
