import { test } from './test-helper.js';
import { createTestDb, dropTestDb } from './db/test-db.js';
import { DB } from './db/index.js';
import { CapabilityController } from './controller.js';

let db: DB;
let testDbInfo: { url: string, schema: string };
let controller: CapabilityController;

test.before(async () => {
  testDbInfo = await createTestDb();
  db = new DB(testDbInfo.url);
  await db.initDb();
  controller = new CapabilityController(db);
});

test.after.always(async () => {
  await db.close();
  await dropTestDb(testDbInfo);
});

test('makeRouter should create router capability when given admin capability', async t => {
  // Get admin capability
  const adminCap = await db.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  // Create router capability
  const routerId = await controller.makeRouter(adminCap.id, {
    pathTemplate: '/api/:param',
    ttlSeconds: 3600,
    transformFn: 'req => req',
    secrets: { apiKey: 'test-key' }
  });
  t.truthy(routerId, 'Should return router capability ID');
  t.is(routerId.length, 32, 'Should be 32 character ID');

  // Verify router capability
  const routerCap = await db.getCapability(routerId);
  t.truthy(routerCap, 'Router capability should exist');
  t.is(routerCap.type, 'router');
});

test('makeRouter should throw with invalid admin capability', async t => {
  await t.throwsAsync(
    () => controller.makeRouter('invalid-id', {
      pathTemplate: '/api/:param',
      ttlSeconds: 3600,
      transformFn: 'req => req',
    }),
    { message: 'Invalid admin capability' }
  );
});

test('makeRouter should create router capability with options', async t => {
  const adminCap = await db.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  const options = {
    pathTemplate: '/api/:param',
    ttlSeconds: 3600,
    secrets: { apiKey: 'test-key' },
    transformFn: 'req => req',
  };

  const routerId = await controller.makeRouter(adminCap.id, options);
  t.truthy(routerId, 'Should return router capability ID');

  // Verify router capability and config
  const routerCap = await db.getCapability(routerId);
  t.truthy(routerCap, 'Router capability should exist');
  t.is(routerCap.type, 'router');

  const routerConfig = await controller.getRouter(routerId);
  if (!routerConfig) {
    t.fail('Router config should exist');
    return;
  }
  t.is(routerConfig.pathTemplate, options.pathTemplate);
  t.is(routerConfig.ttlSeconds, options.ttlSeconds);
  t.is(routerConfig.transformFn, options.transformFn);
  t.deepEqual(JSON.parse(routerConfig.secrets), options.secrets);
});

test('makeRouter should require transformFn', async t => {
  const adminCap = await db.getAdminCapability();
  await t.throwsAsync(
    // @ts-expect-error testing missing required field
    () => controller.makeRouter(adminCap.id, {}),
    { message: 'notNull violation: router_v1.transformFn cannot be null' }
  );
}); 