CREATE TABLE "CheckInRewardLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "checkinDate" TEXT NOT NULL,
    "rewardDay" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardName" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "streak" INTEGER NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckInRewardLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CheckInRewardLog_userId_checkinDate_rewardDay_key" ON "CheckInRewardLog"("userId", "checkinDate", "rewardDay");
CREATE INDEX "CheckInRewardLog_userId_grantedAt_idx" ON "CheckInRewardLog"("userId", "grantedAt");
CREATE INDEX "CheckInRewardLog_checkinDate_idx" ON "CheckInRewardLog"("checkinDate");

CREATE TABLE "CheckInRiskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "deviceId" TEXT,
    "ip" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckInRiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CheckInRiskEvent_userId_createdAt_idx" ON "CheckInRiskEvent"("userId", "createdAt");
CREATE INDEX "CheckInRiskEvent_ip_createdAt_idx" ON "CheckInRiskEvent"("ip", "createdAt");
CREATE INDEX "CheckInRiskEvent_deviceId_createdAt_idx" ON "CheckInRiskEvent"("deviceId", "createdAt");
