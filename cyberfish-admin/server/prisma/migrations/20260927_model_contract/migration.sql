ALTER TABLE "MlModel" ADD COLUMN "outputLayout" TEXT NOT NULL DEFAULT 'FIELDS_BY_CANDIDATES';

UPDATE "MlModel"
SET
  "inputName" = COALESCE("inputName", 'in0'),
  "outputName" = COALESCE("outputName", 'out0'),
  "outputLayout" = COALESCE("outputLayout", 'FIELDS_BY_CANDIDATES'),
  "valuesPerDetection" = CASE WHEN "valuesPerDetection" = 6 THEN 5 ELSE "valuesPerDetection" END
WHERE "framework" = 'NCNN';
