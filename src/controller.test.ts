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
  const routerCap = await controller.makeRouter(adminCap, 'test', {
    pathTemplate: '/api/:param',
    ttlSeconds: 3600,
    transformFn: 'req => req',
    secrets: { apiKey: 'test-key' }
  });
  t.truthy(routerCap, 'Should return router capability');
  t.is(routerCap.id.length, 32, 'Should be 32 character ID');

  // Verify router capability
  const routerCap2 = await db.getCapability(routerCap.id);
  t.truthy(routerCap2, 'Router capability should exist');
  t.is(routerCap2.type, 'router');
});

test('makeRouter should throw with invalid writer capability', async t => {
  await t.throwsAsync(
    // @ts-expect-error testing invalid writer capability
    () => controller.makeRouter(null, 'test', {
      pathTemplate: '/api/:param',
      ttlSeconds: 3600,
      transformFn: 'req => req',
    }),
    { message: 'Invalid writer capability' }
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

  const routerCap = await controller.makeRouter(adminCap, 'test', options);
  t.truthy(routerCap, 'Should return router capability');

  // Verify router capability and config
  const routerCap2 = await db.getCapability(routerCap.id);
  t.truthy(routerCap2, 'Router capability should exist');
  t.is(routerCap2.type, 'router');

  t.is(routerCap.pathTemplate, options.pathTemplate);
  t.is(routerCap.ttlSeconds, options.ttlSeconds);
  t.is(routerCap.transformFn, options.transformFn);
  t.deepEqual(JSON.parse(routerCap.secrets), options.secrets);
});

test('makeRouter should require transformFn', async t => {
  const adminCap = await db.getAdminCapability();
  await t.throwsAsync(
    // @ts-expect-error testing missing required field
    () => controller.makeRouter(adminCap, 'test', {}),
    { message: 'notNull violation: router_v1.transformFn cannot be null' }
  );
}); 