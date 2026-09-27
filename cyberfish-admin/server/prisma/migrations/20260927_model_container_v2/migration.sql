CREATE TABLE IF NOT EXISTS "MlModel" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "map50" REAL NOT NULL DEFAULT 0,
  "map50_95" REAL NOT NULL DEFAULT 0,
  "precision" REAL NOT NULL DEFAULT 0,
  "recall" REAL NOT NULL DEFAULT 0,
  "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
  "minAppCode" INTEGER,
  "maxAppCode" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isRollback" BOOLEAN NOT NULL DEFAULT false,
  "rollbackToId" TEXT,
  "publishedAt" DATETIME,
  "remark" TEXT,
  "signature" TEXT,
  "signatureAlgorithm" TEXT,
  "publicKeyId" TEXT,
  "signatureExpiresAt" TEXT,
  "runtimeSignatureName" TEXT,
  "inputName" TEXT,
  "inputLayout" TEXT NOT NULL DEFAULT 'NCHW',
  "outputName" TEXT,
  "coordinatesNormalized" BOOLEAN NOT NULL DEFAULT false,
  "valuesPerDetection" INTEGER NOT NULL DEFAULT 6,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MlModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MlModel_modelVersion_key" ON "MlModel"("modelVersion");
CREATE INDEX IF NOT EXISTS "MlModel_status_idx" ON "MlModel"("status");
CREATE INDEX IF NOT EXISTS "MlModel_quant_idx" ON "MlModel"("quant");
CREATE INDEX IF NOT EXISTS "MlModel_createdAt_idx" ON "MlModel"("createdAt");

ALTER TABLE "MlModel" ADD COLUMN "manifestSignature" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "manifestSignatureAlgorithm" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "manifestPublicKeyId" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "manifestHash" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "containerVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MlModel" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "MlModel_containerVersion_generation_idx" ON "MlModel"("containerVersion", "generation");
