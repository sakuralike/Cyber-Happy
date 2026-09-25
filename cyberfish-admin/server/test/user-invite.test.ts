import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'user-invite-'));
const testDatabase = join(testDir, 'user-invite.db');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.INVITE_CODE_SECRET = 'test-invite-secret';

let prisma: any;
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;
let userService: typeof import('../src/modules/user/service');
let inviteService: typeof import('../src/modules/invite/service');
let adminToken: string;

async function setPolicy(values: Record<string, unknown>) {
  const revision = await prisma.configRevision.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
  assert.ok(revision);
  const snapshot = JSON.parse(revision.snapshotJson);
  snapshot.USER_PAGE = { ...snapshot.USER_PAGE, ...values };
  await prisma.configRevision.update({ where: { id: revision.id }, data: { snapshotJson: JSON.stringify(snapshot) } });
  for (const [key, value] of Object.entries(values)) {
    await prisma.siteSetting.upsert({
      where: { scope_key: { scope: 'USER_PAGE', key } },
      create: { id: `USER_PAGE:${key}`, scope: 'USER_PAGE', key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value), draftValue: null },
    });
  }
}

async function createInvite(input: { maxUses?: number; mode?: 'SINGLE' | 'MULTI' } = {}) {
  const result = await inviteService.create({
    mode: input.mode ?? 'SINGLE',
    quantity: 1,
    maxUses: input.maxUses ?? 1,
    expiresAt: null,
    note: 'test',
  });
  return result.items[0]!.code;
}

before(async () => {
  execFileSync(process.execPath, [join(serverDir, '..', 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: `file:${testDatabase.replaceAll('\\', '/')}` },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  userService = await import('../src/modules/user/service');
  inviteService = await import('../src/modules/invite/service');
  app = await (await import('../src/app')).buildApp();
  const admin = await prisma.adminUser.create({ data: { username: `invite-admin-${randomUUID()}`, passwordHash: 'test', displayName: '邀请码管理员', role: 'ADMIN' } });
  adminToken = app.jwt.sign({ sub: admin.id, role: 'ADMIN', username: admin.username }, { expiresIn: '5m' });
  await setPolicy({
    'auth.loginEnabled': true,
    'auth.registrationEnabled': true,
    'auth.inviteRequired': false,
  });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('user login and invitation registration controls', { concurrency: false }, () => {
  it('rejects user login when the published login switch is disabled', async () => {
    const { hashPassword } = await import('../src/lib/hash');
    await prisma.userAccount.create({
      data: { username: 'login-disabled', passwordHash: await hashPassword('secret123'), displayName: 'login-disabled' },
    });
    await setPolicy({ 'auth.loginEnabled': false });

    const response = await app.inject({ method: 'POST', url: '/api/v1/users/login', payload: { username: 'login-disabled', password: 'secret123' } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, 40304);

    await setPolicy({ 'auth.loginEnabled': true });
  });

  it('requires and consumes a single-use invite atomically', async () => {
    await setPolicy({ 'auth.registrationEnabled': true, 'auth.inviteRequired': true });
    const missing = await app.inject({ method: 'POST', url: '/api/v1/users/register', headers: { 'x-forwarded-for': '192.0.2.1' }, payload: { username: 'missing-invite', password: 'secret123' } });
    assert.equal(missing.statusCode, 422);
    assert.equal(missing.json().code, 42210);

    const code = await createInvite();
    const first = await app.inject({ method: 'POST', url: '/api/v1/users/register', headers: { 'x-forwarded-for': '192.0.2.2' }, payload: { username: 'single-invite', password: 'secret123', inviteCode: code } });
    assert.equal(first.statusCode, 201);
    const second = await app.inject({ method: 'POST', url: '/api/v1/users/register', headers: { 'x-forwarded-for': '192.0.2.3' }, payload: { username: 'single-invite-2', password: 'secret123', inviteCode: code } });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().code, 40913);
  });

  it('never exceeds a multi-use invite limit under concurrent registration', async () => {
    await setPolicy({ 'auth.inviteRequired': true });
    const code = await createInvite({ mode: 'MULTI', maxUses: 2 });
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => app.inject({
        method: 'POST',
        url: '/api/v1/users/register',
        headers: { 'x-forwarded-for': `192.0.2.${10 + index}` },
        payload: { username: `multi-invite-${index}`, password: 'secret123', inviteCode: code },
      })),
    );
    assert.equal(responses.filter((response) => response.statusCode === 201).length, 2);
    assert.equal(await prisma.inviteCodeRedemption.count(), 3); // includes the single-use case above
    const row = await prisma.inviteCode.findUnique({ where: { codeHash: inviteService.hashCode(code) } });
    assert.equal(row.usedCount, 2);
  });

  it('rejects new registration when the registration switch is disabled', async () => {
    await setPolicy({ 'auth.registrationEnabled': false, 'auth.inviteRequired': false });
    const response = await app.inject({ method: 'POST', url: '/api/v1/users/register', headers: { 'x-forwarded-for': '192.0.2.30' }, payload: { username: 'registration-disabled', password: 'secret123' } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, 40305);
    await setPolicy({ 'auth.registrationEnabled': true });
  });

  it('creates codes once, hides secrets from list responses, and revokes future redemption', async () => {
    await setPolicy({ 'auth.registrationEnabled': true, 'auth.inviteRequired': true });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/invite-codes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mode: 'SINGLE', quantity: 1, maxUses: 1, expiresAt: null, note: 'route-test' },
    });
    assert.equal(created.statusCode, 201);
    const code = created.json().data.items[0].code as string;
    const inviteId = created.json().data.items[0].invite.id as string;

    const listed = await app.inject({ method: 'GET', url: '/api/v1/admin/invite-codes?page=1&pageSize=20', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(listed.statusCode, 200);
    assert.equal(JSON.stringify(listed.json()).includes(code), false);
    assert.equal(JSON.stringify(listed.json()).includes('codeHash'), false);

    const revoked = await app.inject({ method: 'POST', url: `/api/v1/admin/invite-codes/${inviteId}/revoke`, headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().data.status, 'REVOKED');
    const redeemed = await app.inject({ method: 'POST', url: '/api/v1/users/register', headers: { 'x-forwarded-for': '192.0.2.40' }, payload: { username: 'revoked-invite', password: 'secret123', inviteCode: code } });
    assert.equal(redeemed.statusCode, 422);
    assert.equal(redeemed.json().code, 42213);
    assert.equal(await prisma.userAccount.count({ where: { username: 'revoked-invite' } }), 0);
  });

  it('keeps the admin login boundary independent from the user login switch', async () => {
    await setPolicy({ 'auth.loginEnabled': false });
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'unknown-admin', password: 'secret123' } });
    assert.equal(response.statusCode, 401);
    assert.notEqual(response.json().code, 40304);
    await setPolicy({ 'auth.loginEnabled': true });
  });

  it('rejects an expired invite before creating a user', async () => {
    await setPolicy({ 'auth.registrationEnabled': true, 'auth.inviteRequired': true });
    const row = await prisma.inviteCode.create({
      data: { codeHash: inviteService.hashCode('CF-EXPIRED-TEST'), codePrefix: 'CF-EXPI', mode: 'SINGLE', maxUses: 1, expiresAt: new Date(Date.now() - 60_000) },
    });
    assert.ok(row.id);
    const response = await app.inject({ method: 'POST', url: '/api/v1/users/register', headers: { 'x-forwarded-for': '192.0.2.50' }, payload: { username: 'expired-invite', password: 'secret123', inviteCode: 'CF-EXPIRED-TEST' } });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().code, 42212);
    assert.equal(await prisma.userAccount.count({ where: { username: 'expired-invite' } }), 0);
  });
});
