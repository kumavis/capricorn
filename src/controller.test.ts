import { test } from './test-helper.js';
import { createTestDb, dropTestDb } from './db/test-db.js';
import { DB } from './db/index.js';
import { CapabilityController } from './controller.js';
import { labelForCapabilityChain } from './db/models/capability.js';

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

test('getCapabilityChain should return capabilities from root to leaf', async t => {
  // Create test chain: admin -> writer -> router
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  // Create writer
  const writerCap = await controller.makeWriter(adminCap, 'test-writer');
  
  // Create router
  const routerCap = await controller.makeRouter(writerCap, 'test-router', {
    transformFn: 'req => req',
    secrets: { key: 'test' },
    ttlSeconds: 3600
  });

  // Verify each capability exists
  const writerCheck = await controller.getCapability(writerCap.id);
  t.truthy(writerCheck, 'Writer capability should exist');
  
  const routerCheck = await controller.getCapability(routerCap.id);
  t.truthy(routerCheck, 'Router capability should exist');

  // Get chain starting from router
  const chain = await controller.getCapabilityChain(routerCap.id);
  // Verify chain
  t.is(chain.length, 3, 'Chain should have 3 capabilities');
  t.is(labelForCapabilityChain(chain), 'Admin/test-writer/test-router');
  
  // Check order and types (root to leaf)
  t.is(chain[0].type, 'admin');
  t.is(chain[1].type, 'writer');
  t.is(chain[2].type, 'router');

  // Verify relationships
  t.is(chain[1].parentCapId, chain[0].id);
  t.is(chain[2].parentCapId, chain[1].id);

  // Verify labels
  t.is(chain[0].label, 'Admin');
  t.is(chain[1].label, 'test-writer');
  t.is(chain[2].label, 'test-router');
});

test('validateCapabilityChain should pass for valid chain', async t => {
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  const writerCap = await controller.makeWriter(adminCap, 'test-writer');
  const chain = [adminCap, writerCap];
  // Should not throw
  await t.notThrowsAsync(() => controller.validateCapabilityChain(chain));
});

test('validateCapabilityChain should fail if root is not admin', async t => {
  // Create a writer without proper chain
  const fakeWriter = await db.makeCapability({ 
    type: 'writer', 
    label: 'fake', 
    parentCap: null 
  });
  const chain = [fakeWriter];
  await t.throwsAsync(
    () => controller.validateCapabilityChain(chain),
    { message: 'Capability chain must start with admin capability' }
  );
}); 