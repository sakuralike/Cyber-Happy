CREATE TABLE IF NOT EXISTS "Misreport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceModel" TEXT NOT NULL DEFAULT '',
  "osVersion" TEXT NOT NULL DEFAULT '',
  "appVersionName" TEXT NOT NULL DEFAULT '',
  "appVersionCode" INTEGER NOT NULL DEFAULT 0,
  "modelVersion" TEXT NOT NULL DEFAULT '',
  "appVersionId" TEXT,
  "reportType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "userNote" TEXT NOT NULL DEFAULT '',
  "rawData" TEXT NOT NULL DEFAULT '{}',
  "thumbnailUrl" TEXT,
  "snapshotUrls" TEXT NOT NULL DEFAULT '[]',
  "videoUrl" TEXT,
  "sceneTags" TEXT NOT NULL DEFAULT '[]',
  "rootCause" TEXT,
  "groundTruth" TEXT,
  "reviewerNote" TEXT,
  "resolution" TEXT,
  "addToTrainingSet" BOOLEAN NOT NULL DEFAULT false,
  "assignedToId" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" DATETIME,
  "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Misreport_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Misreport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Misreport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Misreport_reportNo_key" ON "Misreport"("reportNo");
CREATE INDEX IF NOT EXISTS "Misreport_status_idx" ON "Misreport"("status");
CREATE INDEX IF NOT EXISTS "Misreport_reportType_idx" ON "Misreport"("reportType");
CREATE INDEX IF NOT EXISTS "Misreport_appVersionCode_idx" ON "Misreport"("appVersionCode");
CREATE INDEX IF NOT EXISTS "Misreport_modelVersion_idx" ON "Misreport"("modelVersion");
CREATE INDEX IF NOT EXISTS "Misreport_assignedToId_idx" ON "Misreport"("assignedToId");
CREATE INDEX IF NOT EXISTS "Misreport_reportedAt_idx" ON "Misreport"("reportedAt");
CREATE INDEX IF NOT EXISTS "Misreport_deviceId_idx" ON "Misreport"("deviceId");

CREATE TABLE IF NOT EXISTS "MisreportStatusLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "misreportId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "operatorId" TEXT,
  "operatorName" TEXT NOT NULL DEFAULT 'system',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MisreportStatusLog_misreportId_fkey" FOREIGN KEY ("misreportId") REFERENCES "Misreport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MisreportStatusLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MisreportStatusLog_misreportId_idx" ON "MisreportStatusLog"("misreportId");
CREATE INDEX IF NOT EXISTS "MisreportStatusLog_createdAt_idx" ON "MisreportStatusLog"("createdAt");

ALTER TABLE "Misreport" ADD COLUMN "snapshotAssetIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Misreport" ADD COLUMN "videoAssetId" TEXT;
