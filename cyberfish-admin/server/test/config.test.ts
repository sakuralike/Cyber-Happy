import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

let validateProductionConfig: typeof import('../src/config').validateProductionConfig;

before(async () => {
  process.env.NODE_ENV = 'test';
  ({ validateProductionConfig } = await import('../src/config'));
});

const safeConfig = {
  jwtSecret: 'a-production-jwt-secret',
  appApiToken: 'a-production-app-token',
  inviteCodeSecret: 'a-production-invite-secret',
  corsOrigin: 'https://admin.example.com',
  deviceAuthDualMode: false,
  modelLegacyV1Allowed: false,
  securityMigrationMode: false,
};

describe('production configuration validation', () => {
  it('accepts explicit production security settings', () => {
    assert.doesNotThrow(() => validateProductionConfig(safeConfig));
  });

  it('rejects development defaults and unsafe compatibility switches', () => {
    assert.throws(
      () => validateProductionConfig({
        jwtSecret: 'cyberfish-admin-dev-secret-change-me-in-production',
        appApiToken: 'cyberfish-app-token-dev',
        inviteCodeSecret: 'cyberfish-invite-secret-change-me',
        corsOrigin: '*',
        deviceAuthDualMode: true,
        modelLegacyV1Allowed: true,
        securityMigrationMode: false,
      }),
      /JWT_SECRET.*APP_API_TOKEN.*INVITE_CODE_SECRET.*CORS_ORIGIN.*DEVICE_AUTH_DUAL_MODE.*MODEL_LEGACY_V1_ALLOWED/,
    );
  });

  it('allows an explicit, temporary migration mode', () => {
    assert.doesNotThrow(() => validateProductionConfig({
      ...safeConfig,
      deviceAuthDualMode: true,
      modelLegacyV1Allowed: true,
      securityMigrationMode: true,
    }));
  });
});
