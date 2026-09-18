CREATE TABLE "CheckInRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "checkinDate" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streak" INTEGER NOT NULL,
    CONSTRAINT "CheckInRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CheckInRecord_userId_checkinDate_key" ON "CheckInRecord"("userId", "checkinDate");
CREATE INDEX "CheckInRecord_userId_checkinDate_idx" ON "CheckInRecord"("userId", "checkinDate");
CREATE INDEX "CheckInRecord_checkinDate_idx" ON "CheckInRecord"("checkinDate");
