ALTER TABLE "MlModel" ADD COLUMN "manifestSignature" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "manifestSignatureAlgorithm" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "manifestPublicKeyId" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "manifestHash" TEXT;
ALTER TABLE "MlModel" ADD COLUMN "containerVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MlModel" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "MlModel_containerVersion_generation_idx" ON "MlModel"("containerVersion", "generation");
