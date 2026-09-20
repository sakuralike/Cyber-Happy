PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CheckInRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "checkinDate" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streak" INTEGER NOT NULL,
    CONSTRAINT "CheckInRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_CheckInRecord" ("id", "userId", "checkinDate", "deviceId", "checkedAt", "streak")
SELECT "id", "userId", "checkinDate", "deviceId", "checkedAt", "streak"
FROM "CheckInRecord";

DROP TABLE "CheckInRecord";
ALTER TABLE "new_CheckInRecord" RENAME TO "CheckInRecord";

CREATE UNIQUE INDEX "CheckInRecord_userId_checkinDate_key" ON "CheckInRecord"("userId", "checkinDate");
CREATE INDEX "CheckInRecord_userId_checkinDate_idx" ON "CheckInRecord"("userId", "checkinDate");
CREATE INDEX "CheckInRecord_deviceId_userId_idx" ON "CheckInRecord"("deviceId", "userId");
CREATE INDEX "CheckInRecord_checkinDate_idx" ON "CheckInRecord"("checkinDate");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
