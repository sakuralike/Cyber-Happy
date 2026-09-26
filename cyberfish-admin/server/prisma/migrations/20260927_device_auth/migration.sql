CREATE TABLE "AppDeviceCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "signingKeyId" TEXT NOT NULL,
    "signingPublicKey" TEXT NOT NULL,
    "modelKeyId" TEXT,
    "modelPublicKey" TEXT,
    "securityLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "appVersionCode" INTEGER NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    "lastSeenAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "AppDeviceCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AppDeviceCredential_modelKeyId_fkey" FOREIGN KEY ("modelKeyId") REFERENCES "ModelDeviceKey" ("keyId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DeviceAuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'TOKEN',
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceAuthChallenge_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppDeviceCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DeviceRequestNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceRequestNonce_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppDeviceCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AppDeviceCredential_deviceId_key" ON "AppDeviceCredential"("deviceId");
CREATE UNIQUE INDEX "AppDeviceCredential_signingKeyId_key" ON "AppDeviceCredential"("signingKeyId");
CREATE UNIQUE INDEX "AppDeviceCredential_modelKeyId_key" ON "AppDeviceCredential"("modelKeyId");
CREATE INDEX "AppDeviceCredential_status_idx" ON "AppDeviceCredential"("status");
CREATE INDEX "AppDeviceCredential_userId_idx" ON "AppDeviceCredential"("userId");
CREATE INDEX "AppDeviceCredential_lastSeenAt_idx" ON "AppDeviceCredential"("lastSeenAt");

CREATE UNIQUE INDEX "DeviceAuthChallenge_challengeHash_key" ON "DeviceAuthChallenge"("challengeHash");
CREATE INDEX "DeviceAuthChallenge_deviceId_expiresAt_idx" ON "DeviceAuthChallenge"("deviceId", "expiresAt");
CREATE INDEX "DeviceAuthChallenge_credentialId_usedAt_idx" ON "DeviceAuthChallenge"("credentialId", "usedAt");

CREATE UNIQUE INDEX "DeviceRequestNonce_deviceId_nonce_key" ON "DeviceRequestNonce"("deviceId", "nonce");
CREATE INDEX "DeviceRequestNonce_expiresAt_idx" ON "DeviceRequestNonce"("expiresAt");
CREATE INDEX "DeviceRequestNonce_credentialId_createdAt_idx" ON "DeviceRequestNonce"("credentialId", "createdAt");
