CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeHash" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InviteCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InviteCodeRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    CONSTRAINT "InviteCodeRedemption_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InviteCodeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InviteCode_codeHash_key" ON "InviteCode"("codeHash");
CREATE INDEX "InviteCode_createdAt_idx" ON "InviteCode"("createdAt");
CREATE INDEX "InviteCode_status_lookup_idx" ON "InviteCode"("revokedAt", "expiresAt", "usedCount", "maxUses");
CREATE INDEX "InviteCode_createdById_createdAt_idx" ON "InviteCode"("createdById", "createdAt");
CREATE UNIQUE INDEX "InviteCodeRedemption_inviteCodeId_userId_key" ON "InviteCodeRedemption"("inviteCodeId", "userId");
CREATE INDEX "InviteCodeRedemption_inviteCodeId_registeredAt_idx" ON "InviteCodeRedemption"("inviteCodeId", "registeredAt");
CREATE INDEX "InviteCodeRedemption_userId_registeredAt_idx" ON "InviteCodeRedemption"("userId", "registeredAt");
