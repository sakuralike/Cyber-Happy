CREATE TABLE IF NOT EXISTS "SiteConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '赛博鱼乐',
    "content" TEXT NOT NULL DEFAULT '',
    "apkUrl" TEXT,
    "apkFileId" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "draftValue" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DownloadLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'official',
    "versionName" TEXT,
    "minVersion" INTEGER,
    "mode" TEXT NOT NULL,
    "url" TEXT,
    "fileId" TEXT,
    "qrFileId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DownloadLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DownloadLink_qrFileId_fkey" FOREIGN KEY ("qrFileId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Banner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageFileId" TEXT,
    "imageUrl" TEXT,
    "linkType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "linkUrl" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'ALL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Banner_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LandingModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "contentJson" TEXT NOT NULL,
    "draftContentJson" TEXT,
    "draftSortOrder" INTEGER,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LandingModule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ConfigRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "scopes" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "changesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "effectiveAt" DATETIME,
    "publishedById" TEXT,
    "rolledBackById" TEXT,
    "rolledBackAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "ConfigRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConfigRevision_rolledBackById_fkey" FOREIGN KEY ("rolledBackById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ConfigSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "SiteSetting_scope_key_key" ON "SiteSetting"("scope", "key");
CREATE INDEX "SiteSetting_scope_idx" ON "SiteSetting"("scope");
CREATE UNIQUE INDEX "DownloadLink_platform_channel_key" ON "DownloadLink"("platform", "channel");
CREATE INDEX "DownloadLink_platform_enabled_idx" ON "DownloadLink"("platform", "enabled");
CREATE INDEX "DownloadLink_sortOrder_idx" ON "DownloadLink"("sortOrder");
CREATE INDEX "Banner_enabled_startAt_endAt_idx" ON "Banner"("enabled", "startAt", "endAt");
CREATE INDEX "Banner_platform_enabled_idx" ON "Banner"("platform", "enabled");
CREATE INDEX "Banner_sortOrder_idx" ON "Banner"("sortOrder");
CREATE INDEX "LandingModule_type_enabled_idx" ON "LandingModule"("type", "enabled");
CREATE INDEX "LandingModule_sortOrder_idx" ON "LandingModule"("sortOrder");
CREATE UNIQUE INDEX "ConfigRevision_version_key" ON "ConfigRevision"("version");
CREATE INDEX "ConfigRevision_status_effectiveAt_idx" ON "ConfigRevision"("status", "effectiveAt");
CREATE INDEX "ConfigRevision_publishedAt_idx" ON "ConfigRevision"("publishedAt");
CREATE UNIQUE INDEX "ConfigSubscriber_clientId_key" ON "ConfigSubscriber"("clientId");
CREATE INDEX "ConfigSubscriber_lastSeenAt_idx" ON "ConfigSubscriber"("lastSeenAt");
