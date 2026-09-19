ALTER TABLE "CheckInRecord" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "CheckInRecord_deviceId_userId_idx" ON "CheckInRecord"("deviceId", "userId");
