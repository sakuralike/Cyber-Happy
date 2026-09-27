import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'model-dispatch-scale-'));
const testDatabase = join(testDir, 'model-dispatch-scale.db');
writeFileSync(testDatabase, '');
const databasePath = `./${relative(join(serverDir, 'prisma'), testDatabase).replaceAll('\\', '/')}`;
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.UPLOAD_DIR = join(testDir, 'uploads');
process.env.MODEL_CONTAINER_V2_ENABLED = 'false';
process.env.MODEL_LEGACY_V1_ALLOWED = 'true';

let prisma: any;
let service: typeof import('../src/modules/model/service');

before(async () => {
  execFileSync(process.execPath, [join(serverDir, '..', 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  service = await import('../src/modules/model/service');
});

after(async () => {
  await prisma.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('model dispatch device pagination', () => {
  it('rejects rollback to a lower-generation model before creating a dispatch', async () => {
    const modelBase = {
      name: 'rollback-policy-model', arch: 'YOLO26n', quant: 'FP32', framework: 'NCNN',
      fileUrl: '/files/models/rollback-policy.bin', fileSize: BigInt(1), sha256: 'a'.repeat(64),
      labels: '["鱼漂"]', inputName: 'in0', outputName: 'out0',
      outputLayout: 'FIELDS_BY_CANDIDATES', inputLayout: 'NCHW', valuesPerDetection: 5,
      signature: 'model-signature', signatureAlgorithm: 'ECDSA_P256_SHA256', publicKeyId: 'model-key',
      containerVersion: 1,
    };
    const current = await prisma.mlModel.create({
      data: { ...modelBase, modelVersion: 'rollback-policy-current', status: 'ONLINE', generation: 2 },
    });
    const older = await prisma.mlModel.create({
      data: { ...modelBase, modelVersion: 'rollback-policy-older', status: 'OFFLINE', generation: 1 },
    });

    await assert.rejects(
      service.rollback(current.id, { toModelId: older.id, reason: 'policy test', scope: 'ALL' }),
      /generation 更低/,
    );
    assert.equal(await prisma.modelDispatch.count({ where: { modelId: older.id, isRollback: true } }), 0);
    assert.equal((await prisma.mlModel.findUnique({ where: { id: current.id } })).status, 'ONLINE');
  });

  it('dispatches and rolls back all 20,000 devices without truncation', async () => {
    const deviceCount = 20_000;
    const devices = Array.from({ length: deviceCount }, (_, index) => ({
      deviceId: `scale-device-${String(index).padStart(5, '0')}`,
      channel: 'scale',
      deviceModel: 'test',
      appVersionCode: 147,
      modelVersion: '',
    }));
    await prisma.appUser.createMany({ data: devices });

    const modelBase = {
      name: 'scale-model', arch: 'YOLO26n', quant: 'FP32', framework: 'NCNN',
      fileUrl: '/files/models/scale.bin', fileSize: BigInt(1), sha256: 'a'.repeat(64),
      status: 'DRAFT', labels: '["鱼漂"]', inputName: 'in0', outputName: 'out0',
      outputLayout: 'FIELDS_BY_CANDIDATES', inputLayout: 'NCHW', valuesPerDetection: 5,
      signature: 'model-signature', signatureAlgorithm: 'ECDSA_P256_SHA256', publicKeyId: 'model-key',
      containerVersion: 1, generation: 1,
    };
    const model = await prisma.mlModel.create({ data: { ...modelBase, modelVersion: 'scale-model-v1' } });
    const rollbackTarget = await prisma.mlModel.create({ data: { ...modelBase, modelVersion: 'scale-model-v0' } });

    const dispatch = await service.dispatch(model.id, {
      targetType: 'GLOBAL', targetValue: {}, grayPercent: 100,
    });
    assert.equal(dispatch.matchedDevices, deviceCount);
    const originLogCount = await prisma.deviceDispatchLog.count({ where: { dispatchId: dispatch.id } });
    assert.equal(originLogCount, deviceCount);

    const rollback = await service.rollback(model.id, {
      toModelId: rollbackTarget.id, reason: 'scale test', scope: 'ALL',
    });
    assert.equal(rollback.affectedDevices, deviceCount);
    const rollbackLogCount = await prisma.deviceDispatchLog.count({ where: { dispatchId: rollback.rollbackDispatchId } });
    assert.equal(rollbackLogCount, deviceCount);

    const first = await prisma.deviceDispatchLog.findFirst({ where: { dispatchId: dispatch.id }, orderBy: { deviceId: 'asc' } });
    const last = await prisma.deviceDispatchLog.findFirst({ where: { dispatchId: dispatch.id }, orderBy: { deviceId: 'desc' } });
    assert.equal(first.deviceId, 'scale-device-00000');
    assert.equal(last.deviceId, 'scale-device-19999');
  });
});
