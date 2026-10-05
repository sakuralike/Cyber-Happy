-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "email" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "avatarFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCodeRedemption" (
    "id" TEXT NOT NULL,
    "inviteCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WEB',

    CONSTRAINT "InviteCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkinDate" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streak" INTEGER NOT NULL,

    CONSTRAINT "CheckInRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInRewardLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkinDate" TEXT NOT NULL,
    "rewardDay" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardName" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "milestone" BOOLEAN NOT NULL DEFAULT false,
    "streak" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInRewardLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInRiskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "ip" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInRiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ANDROID',
    "channel" TEXT NOT NULL DEFAULT 'official',
    "updateType" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "releaseNotes" TEXT NOT NULL DEFAULT '',
    "downloadMode" TEXT NOT NULL DEFAULT 'EXTERNAL',
    "apkUrl" TEXT,
    "apkSize" BIGINT,
    "apkSha256" TEXT,
    "apkFileId" TEXT,
    "applicationId" TEXT,
    "certificateSha256" TEXT,
    "minSupportedCode" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "grayPercent" INTEGER NOT NULL DEFAULT 0,
    "grayDeviceIds" TEXT NOT NULL DEFAULT '[]',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "onlineAt" TIMESTAMP(3),
    "offlineAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlModel" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arch" TEXT NOT NULL DEFAULT 'YOLOv8n',
    "quant" TEXT NOT NULL DEFAULT 'INT8',
    "framework" TEXT NOT NULL DEFAULT 'TFLITE',
    "fileUrl" TEXT,
    "fileSize" BIGINT,
    "sha256" TEXT,
    "fileId" TEXT,
    "inputSize" INTEGER NOT NULL DEFAULT 640,
    "numClasses" INTEGER NOT NULL DEFAULT 1,
    "labels" TEXT NOT NULL DEFAULT '["鱼漂"]',
    "map50" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "map50_95" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "precision" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recall" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "minAppCode" INTEGER,
    "maxAppCode" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isRollback" BOOLEAN NOT NULL DEFAULT false,
    "rollbackToId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "remark" TEXT,
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "publicKeyId" TEXT,
    "signatureExpiresAt" TEXT,
    "manifestSignature" TEXT,
    "manifestSignatureAlgorithm" TEXT,
    "manifestPublicKeyId" TEXT,
    "manifestHash" TEXT,
    "containerVersion" INTEGER NOT NULL DEFAULT 1,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "runtimeSignatureName" TEXT,
    "inputName" TEXT,
    "inputLayout" TEXT NOT NULL DEFAULT 'NCHW',
    "outputName" TEXT,
    "outputLayout" TEXT NOT NULL DEFAULT 'FIELDS_BY_CANDIDATES',
    "coordinatesNormalized" BOOLEAN NOT NULL DEFAULT false,
    "valuesPerDetection" INTEGER NOT NULL DEFAULT 6,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MlModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelDispatch" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL DEFAULT '{}',
    "grayPercent" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalDevices" INTEGER NOT NULL DEFAULT 0,
    "successDevices" INTEGER NOT NULL DEFAULT 0,
    "failedDevices" INTEGER NOT NULL DEFAULT 0,
    "isRollback" BOOLEAN NOT NULL DEFAULT false,
    "rollbackFromId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "remark" TEXT,
    "operatorId" TEXT,
    "appVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceDispatchLog" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fromModelVersion" TEXT NOT NULL DEFAULT '',
    "toModelVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "clientIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceDispatchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelDeviceKey" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "securityLevel" TEXT NOT NULL,
    "appVersionCode" INTEGER NOT NULL,
    "userId" TEXT,
    "authorizedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ModelDeviceKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppDeviceCredential" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AppDeviceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAuthChallenge" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'TOKEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceRequestNonce" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceRequestNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Misreport" (
    "id" TEXT NOT NULL,
    "reportNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL DEFAULT '',
    "osVersion" TEXT NOT NULL DEFAULT '',
    "appVersionName" TEXT NOT NULL DEFAULT '',
    "appVersionCode" INTEGER NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL DEFAULT '',
    "appVersionId" TEXT,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "userNote" TEXT NOT NULL DEFAULT '',
    "rawData" TEXT NOT NULL DEFAULT '{}',
    "thumbnailUrl" TEXT,
    "snapshotUrls" TEXT NOT NULL DEFAULT '[]',
    "videoUrl" TEXT,
    "snapshotAssetIds" TEXT NOT NULL DEFAULT '[]',
    "videoAssetId" TEXT,
    "sceneTags" TEXT NOT NULL DEFAULT '[]',
    "rootCause" TEXT,
    "groundTruth" TEXT,
    "reviewerNote" TEXT,
    "resolution" TEXT,
    "addToTrainingSet" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Misreport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MisreportStatusLog" (
    "id" TEXT NOT NULL,
    "misreportId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT NOT NULL DEFAULT 'system',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MisreportStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'official',
    "deviceModel" TEXT NOT NULL DEFAULT '',
    "appVersionCode" INTEGER NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL DEFAULT '',
    "modelCallCount" INTEGER NOT NULL DEFAULT 0,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "appVersionCode" INTEGER NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 1,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dau" INTEGER NOT NULL DEFAULT 0,
    "mau" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "activeDevices" INTEGER NOT NULL DEFAULT 0,
    "modelCallCount" INTEGER NOT NULL DEFAULT 0,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "misreportCount" INTEGER NOT NULL DEFAULT 0,
    "misreportRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crashCount" INTEGER NOT NULL DEFAULT 0,
    "avgInferenceMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT NOT NULL DEFAULT 'system',
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
    "before" TEXT,
    "after" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "bizType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT,
    "ownerUserId" TEXT,
    "deviceId" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT NOT NULL DEFAULT '赛博鱼乐',
    "content" TEXT NOT NULL DEFAULT '',
    "apkUrl" TEXT,
    "apkFileId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "draftValue" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadLink" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageFileId" TEXT,
    "imageUrl" TEXT,
    "linkType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "linkUrl" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'ALL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingModule" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "contentJson" TEXT NOT NULL,
    "draftContentJson" TEXT,
    "draftSortOrder" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigRevision" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "scopes" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "changesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "effectiveAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "rolledBackById" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ConfigRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigSubscriber" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AdminUser_role_idx" ON "AdminUser"("role");

-- CreateIndex
CREATE INDEX "AdminUser_status_idx" ON "AdminUser"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_username_key" ON "UserAccount"("username");

-- CreateIndex
CREATE INDEX "UserAccount_status_idx" ON "UserAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_codeHash_key" ON "InviteCode"("codeHash");

-- CreateIndex
CREATE INDEX "InviteCode_createdAt_idx" ON "InviteCode"("createdAt");

-- CreateIndex
CREATE INDEX "InviteCode_revokedAt_expiresAt_usedCount_maxUses_idx" ON "InviteCode"("revokedAt", "expiresAt", "usedCount", "maxUses");

-- CreateIndex
CREATE INDEX "InviteCode_createdById_createdAt_idx" ON "InviteCode"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "InviteCodeRedemption_inviteCodeId_registeredAt_idx" ON "InviteCodeRedemption"("inviteCodeId", "registeredAt");

-- CreateIndex
CREATE INDEX "InviteCodeRedemption_userId_registeredAt_idx" ON "InviteCodeRedemption"("userId", "registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCodeRedemption_inviteCodeId_userId_key" ON "InviteCodeRedemption"("inviteCodeId", "userId");

-- CreateIndex
CREATE INDEX "UserFeedback_userId_createdAt_idx" ON "UserFeedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserFeedback_status_idx" ON "UserFeedback"("status");

-- CreateIndex
CREATE INDEX "CheckInRecord_userId_checkinDate_idx" ON "CheckInRecord"("userId", "checkinDate");

-- CreateIndex
CREATE INDEX "CheckInRecord_deviceId_userId_idx" ON "CheckInRecord"("deviceId", "userId");

-- CreateIndex
CREATE INDEX "CheckInRecord_checkinDate_idx" ON "CheckInRecord"("checkinDate");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInRecord_userId_checkinDate_key" ON "CheckInRecord"("userId", "checkinDate");

-- CreateIndex
CREATE INDEX "CheckInRewardLog_userId_grantedAt_idx" ON "CheckInRewardLog"("userId", "grantedAt");

-- CreateIndex
CREATE INDEX "CheckInRewardLog_checkinDate_idx" ON "CheckInRewardLog"("checkinDate");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInRewardLog_userId_checkinDate_rewardDay_key" ON "CheckInRewardLog"("userId", "checkinDate", "rewardDay");

-- CreateIndex
CREATE INDEX "CheckInRiskEvent_userId_createdAt_idx" ON "CheckInRiskEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInRiskEvent_ip_createdAt_idx" ON "CheckInRiskEvent"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInRiskEvent_deviceId_createdAt_idx" ON "CheckInRiskEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInRiskEvent_createdAt_idx" ON "CheckInRiskEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppVersion_versionCode_key" ON "AppVersion"("versionCode");

-- CreateIndex
CREATE INDEX "AppVersion_status_idx" ON "AppVersion"("status");

-- CreateIndex
CREATE INDEX "AppVersion_platform_channel_idx" ON "AppVersion"("platform", "channel");

-- CreateIndex
CREATE INDEX "AppVersion_createdAt_idx" ON "AppVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MlModel_modelVersion_key" ON "MlModel"("modelVersion");

-- CreateIndex
CREATE INDEX "MlModel_status_idx" ON "MlModel"("status");

-- CreateIndex
CREATE INDEX "MlModel_quant_idx" ON "MlModel"("quant");

-- CreateIndex
CREATE INDEX "MlModel_createdAt_idx" ON "MlModel"("createdAt");

-- CreateIndex
CREATE INDEX "ModelDispatch_modelId_idx" ON "ModelDispatch"("modelId");

-- CreateIndex
CREATE INDEX "ModelDispatch_status_idx" ON "ModelDispatch"("status");

-- CreateIndex
CREATE INDEX "ModelDispatch_createdAt_idx" ON "ModelDispatch"("createdAt");

-- CreateIndex
CREATE INDEX "DeviceDispatchLog_deviceId_idx" ON "DeviceDispatchLog"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceDispatchLog_status_idx" ON "DeviceDispatchLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceDispatchLog_dispatchId_deviceId_key" ON "DeviceDispatchLog"("dispatchId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelDeviceKey_deviceId_key" ON "ModelDeviceKey"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelDeviceKey_keyId_key" ON "ModelDeviceKey"("keyId");

-- CreateIndex
CREATE INDEX "ModelDeviceKey_userId_idx" ON "ModelDeviceKey"("userId");

-- CreateIndex
CREATE INDEX "ModelDeviceKey_revokedAt_idx" ON "ModelDeviceKey"("revokedAt");

-- CreateIndex
CREATE INDEX "UserConsent_userId_acceptedAt_idx" ON "UserConsent"("userId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserConsent_userId_consentType_policyVersion_key" ON "UserConsent"("userId", "consentType", "policyVersion");

-- CreateIndex
CREATE UNIQUE INDEX "AppDeviceCredential_deviceId_key" ON "AppDeviceCredential"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppDeviceCredential_signingKeyId_key" ON "AppDeviceCredential"("signingKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "AppDeviceCredential_modelKeyId_key" ON "AppDeviceCredential"("modelKeyId");

-- CreateIndex
CREATE INDEX "AppDeviceCredential_status_idx" ON "AppDeviceCredential"("status");

-- CreateIndex
CREATE INDEX "AppDeviceCredential_userId_idx" ON "AppDeviceCredential"("userId");

-- CreateIndex
CREATE INDEX "AppDeviceCredential_lastSeenAt_idx" ON "AppDeviceCredential"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAuthChallenge_challengeHash_key" ON "DeviceAuthChallenge"("challengeHash");

-- CreateIndex
CREATE INDEX "DeviceAuthChallenge_deviceId_expiresAt_idx" ON "DeviceAuthChallenge"("deviceId", "expiresAt");

-- CreateIndex
CREATE INDEX "DeviceAuthChallenge_credentialId_usedAt_idx" ON "DeviceAuthChallenge"("credentialId", "usedAt");

-- CreateIndex
CREATE INDEX "DeviceRequestNonce_expiresAt_idx" ON "DeviceRequestNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "DeviceRequestNonce_credentialId_createdAt_idx" ON "DeviceRequestNonce"("credentialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRequestNonce_deviceId_nonce_key" ON "DeviceRequestNonce"("deviceId", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "Misreport_reportNo_key" ON "Misreport"("reportNo");

-- CreateIndex
CREATE INDEX "Misreport_status_idx" ON "Misreport"("status");

-- CreateIndex
CREATE INDEX "Misreport_reportType_idx" ON "Misreport"("reportType");

-- CreateIndex
CREATE INDEX "Misreport_appVersionCode_idx" ON "Misreport"("appVersionCode");

-- CreateIndex
CREATE INDEX "Misreport_modelVersion_idx" ON "Misreport"("modelVersion");

-- CreateIndex
CREATE INDEX "Misreport_assignedToId_idx" ON "Misreport"("assignedToId");

-- CreateIndex
CREATE INDEX "Misreport_reportedAt_idx" ON "Misreport"("reportedAt");

-- CreateIndex
CREATE INDEX "Misreport_deviceId_idx" ON "Misreport"("deviceId");

-- CreateIndex
CREATE INDEX "MisreportStatusLog_misreportId_idx" ON "MisreportStatusLog"("misreportId");

-- CreateIndex
CREATE INDEX "MisreportStatusLog_createdAt_idx" ON "MisreportStatusLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_deviceId_key" ON "AppUser"("deviceId");

-- CreateIndex
CREATE INDEX "AppUser_appVersionCode_idx" ON "AppUser"("appVersionCode");

-- CreateIndex
CREATE INDEX "AppUser_modelVersion_idx" ON "AppUser"("modelVersion");

-- CreateIndex
CREATE INDEX "AppUser_firstSeenAt_idx" ON "AppUser"("firstSeenAt");

-- CreateIndex
CREATE INDEX "AppUser_lastActiveAt_idx" ON "AppUser"("lastActiveAt");

-- CreateIndex
CREATE INDEX "AppEvent_eventType_idx" ON "AppEvent"("eventType");

-- CreateIndex
CREATE INDEX "AppEvent_occurredAt_idx" ON "AppEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AppEvent_deviceId_idx" ON "AppEvent"("deviceId");

-- CreateIndex
CREATE INDEX "AppEvent_appVersionCode_idx" ON "AppEvent"("appVersionCode");

-- CreateIndex
CREATE INDEX "AppEvent_modelVersion_idx" ON "AppEvent"("modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_date_key" ON "DailyMetric"("date");

-- CreateIndex
CREATE INDEX "DailyMetric_date_idx" ON "DailyMetric"("date");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_operatorId_idx" ON "AuditLog"("operatorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_idempotencyKey_key" ON "FileAsset"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FileAsset_bizType_idx" ON "FileAsset"("bizType");

-- CreateIndex
CREATE INDEX "FileAsset_sha256_idx" ON "FileAsset"("sha256");

-- CreateIndex
CREATE INDEX "FileAsset_ownerUserId_createdAt_idx" ON "FileAsset"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FileAsset_deviceId_createdAt_idx" ON "FileAsset"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteSetting_scope_idx" ON "SiteSetting"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_scope_key_key" ON "SiteSetting"("scope", "key");

-- CreateIndex
CREATE INDEX "DownloadLink_platform_enabled_idx" ON "DownloadLink"("platform", "enabled");

-- CreateIndex
CREATE INDEX "DownloadLink_sortOrder_idx" ON "DownloadLink"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadLink_platform_channel_key" ON "DownloadLink"("platform", "channel");

-- CreateIndex
CREATE INDEX "Banner_enabled_startAt_endAt_idx" ON "Banner"("enabled", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Banner_platform_enabled_idx" ON "Banner"("platform", "enabled");

-- CreateIndex
CREATE INDEX "Banner_sortOrder_idx" ON "Banner"("sortOrder");

-- CreateIndex
CREATE INDEX "LandingModule_type_enabled_idx" ON "LandingModule"("type", "enabled");

-- CreateIndex
CREATE INDEX "LandingModule_sortOrder_idx" ON "LandingModule"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigRevision_version_key" ON "ConfigRevision"("version");

-- CreateIndex
CREATE INDEX "ConfigRevision_status_effectiveAt_idx" ON "ConfigRevision"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "ConfigRevision_publishedAt_idx" ON "ConfigRevision"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigSubscriber_clientId_key" ON "ConfigSubscriber"("clientId");

-- CreateIndex
CREATE INDEX "ConfigSubscriber_lastSeenAt_idx" ON "ConfigSubscriber"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCodeRedemption" ADD CONSTRAINT "InviteCodeRedemption_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCodeRedemption" ADD CONSTRAINT "InviteCodeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInRecord" ADD CONSTRAINT "CheckInRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInRewardLog" ADD CONSTRAINT "CheckInRewardLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInRiskEvent" ADD CONSTRAINT "CheckInRiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlModel" ADD CONSTRAINT "MlModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelDispatch" ADD CONSTRAINT "ModelDispatch_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MlModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelDispatch" ADD CONSTRAINT "ModelDispatch_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelDispatch" ADD CONSTRAINT "ModelDispatch_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceDispatchLog" ADD CONSTRAINT "DeviceDispatchLog_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "ModelDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConsent" ADD CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppDeviceCredential" ADD CONSTRAINT "AppDeviceCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppDeviceCredential" ADD CONSTRAINT "AppDeviceCredential_modelKeyId_fkey" FOREIGN KEY ("modelKeyId") REFERENCES "ModelDeviceKey"("keyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAuthChallenge" ADD CONSTRAINT "DeviceAuthChallenge_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppDeviceCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceRequestNonce" ADD CONSTRAINT "DeviceRequestNonce_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppDeviceCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Misreport" ADD CONSTRAINT "Misreport_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Misreport" ADD CONSTRAINT "Misreport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Misreport" ADD CONSTRAINT "Misreport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisreportStatusLog" ADD CONSTRAINT "MisreportStatusLog_misreportId_fkey" FOREIGN KEY ("misreportId") REFERENCES "Misreport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisreportStatusLog" ADD CONSTRAINT "MisreportStatusLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSetting" ADD CONSTRAINT "SiteSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadLink" ADD CONSTRAINT "DownloadLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadLink" ADD CONSTRAINT "DownloadLink_qrFileId_fkey" FOREIGN KEY ("qrFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingModule" ADD CONSTRAINT "LandingModule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigRevision" ADD CONSTRAINT "ConfigRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigRevision" ADD CONSTRAINT "ConfigRevision_rolledBackById_fkey" FOREIGN KEY ("rolledBackById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
