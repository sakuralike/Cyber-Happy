import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'model-actions-'));
const testDatabase = join(testDir, 'model-actions.db');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.UPLOAD_DIR = join(testDir, 'uploads');

let prisma: any;
let service: typeof import('../src/modules/model/service');

before(async () => {
  execFileSync(process.execPath, [join(serverDir, '..', 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  service = await import('../src/modules/model/service');
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('model lifecycle actions', () => {
  it('takes a published model offline and prevents repeated or draft offlining', async () => {
    const online = await service.create({ modelVersion: 'ncnn-action-online', name: 'NCNN action online' });
    await prisma.mlModel.update({ where: { id: online.id }, data: { status: 'ONLINE' } });

    const result = await service.doAction(online.id, { action: 'OFFLINE', reason: '发布新模型' });
    assert.equal(result.before.status, 'ONLINE');
    assert.equal(result.after.status, 'OFFLINE');

    await assert.rejects(
      service.doAction(online.id, { action: 'OFFLINE' }),
      /已处于下架状态/,
    );

    const draft = await service.create({ modelVersion: 'ncnn-action-draft', name: 'NCNN action draft' });
    await assert.rejects(
      service.doAction(draft.id, { action: 'OFFLINE' }),
      /草稿模型无需下架/,
    );
  });

  it('allows deleting drafts and offline models but protects active models', async () => {
    const draft = await service.create({ modelVersion: 'ncnn-delete-draft', name: 'NCNN delete draft' });
    await service.remove(draft.id);
    assert.equal(await prisma.mlModel.findUnique({ where: { id: draft.id } }), null);

    const offline = await service.create({ modelVersion: 'ncnn-delete-offline', name: 'NCNN delete offline' });
    await prisma.mlModel.update({ where: { id: offline.id }, data: { status: 'OFFLINE' } });
    await service.remove(offline.id);
    assert.equal(await prisma.mlModel.findUnique({ where: { id: offline.id } }), null);

    const online = await service.create({ modelVersion: 'ncnn-delete-online', name: 'NCNN delete online' });
    await prisma.mlModel.update({ where: { id: online.id }, data: { status: 'ONLINE' } });
    await assert.rejects(service.remove(online.id), /灰度或已上线模型不可删除/);
  });
});
