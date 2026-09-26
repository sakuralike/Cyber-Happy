CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserConsent_userId_consentType_policyVersion_key" ON "UserConsent"("userId", "consentType", "policyVersion");
CREATE INDEX "UserConsent_userId_acceptedAt_idx" ON "UserConsent"("userId", "acceptedAt");
