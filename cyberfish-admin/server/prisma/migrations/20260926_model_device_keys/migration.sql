CREATE TABLE "ModelDeviceKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "securityLevel" TEXT NOT NULL,
    "appVersionCode" INTEGER NOT NULL,
    "userId" TEXT,
    "authorizedUntil" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME
);

CREATE UNIQUE INDEX "ModelDeviceKey_deviceId_key" ON "ModelDeviceKey"("deviceId");
CREATE UNIQUE INDEX "ModelDeviceKey_keyId_key" ON "ModelDeviceKey"("keyId");
CREATE INDEX "ModelDeviceKey_userId_idx" ON "ModelDeviceKey"("userId");
CREATE INDEX "ModelDeviceKey_revokedAt_idx" ON "ModelDeviceKey"("revokedAt");
