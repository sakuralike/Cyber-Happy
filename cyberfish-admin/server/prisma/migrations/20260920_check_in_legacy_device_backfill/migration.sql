UPDATE "CheckInRecord"
SET "deviceId" = '__legacy_unknown__'
WHERE "deviceId" IS NULL;

CREATE INDEX "CheckInRiskEvent_createdAt_idx" ON "CheckInRiskEvent"("createdAt");
