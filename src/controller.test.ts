import { test } from './test-helper.js';
import { createTestDb, dropTestDb } from './db/test-db.js';
import { DB } from './db/index.js';
import { CapabilityController } from './controller.js';
import { CapabilityOptions, labelForCapabilityChain } from './db/models/capability.js';

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
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test',
    parentCap: adminCap,
    ttl: 3600,
  }
  const router = await controller.makeRouter(capOptions, {
    pathTemplate: '/api/:param',
    transformFn: 'req => req',
    secrets: { apiKey: 'test-key' }
  });
  t.truthy(router, 'Should return router capability');
  t.is(router.id.length, 32, 'Should be 32 character ID');

  // Verify router capability
  const routerCap = await db.getCapability(router.id);
  if (!routerCap) {
    t.fail('Router capability should exist');
    return;
  }
  t.is(routerCap.type, 'router');
});

test('makeRouter should throw with invalid writer capability', async t => {
  const fakeWriter = await db.makeCapability({ 
    type: 'fake', 
    label: 'fake', 
    parentCap: null 
  });
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test',
    parentCap: fakeWriter,
    ttl: 3600,
  }

  await t.throwsAsync(
    () => controller.makeRouter(capOptions, {
      pathTemplate: '/api/:param',
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
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test',
    parentCap: adminCap,
    ttl: 3600,
  }
  const router = await controller.makeRouter(capOptions, options);
  t.truthy(router, 'Should return router capability');

  // Verify router capability and config
  const routerCap2 = await db.getCapability(router.id);
  if (!routerCap2) {
    t.fail('Router capability should exist');
    return;
  }
  t.is(routerCap2.type, 'router');
  t.is(router.pathTemplate, options.pathTemplate);
  t.is(router.transformFn, options.transformFn);
  t.deepEqual(JSON.parse(router.secrets), options.secrets);
});

test('makeRouter should require transformFn', async t => {
  const adminCap = await db.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test',
    parentCap: adminCap,
    ttl: 3600,
  }
  await t.throwsAsync(
    // @ts-expect-error testing missing required field
    () => controller.makeRouter(capOptions, {
      pathTemplate: '/api/:param',
    }),
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
  const writerCap = await controller.makeWriter({
    label: 'test-writer',
    parentCap: adminCap,
  });
  
  // Create router
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test-router',
    parentCap: writerCap,
    ttl: 3600,
  }
  const routerCap = await controller.makeRouter(capOptions, {
    transformFn: 'req => req',
    secrets: { key: 'test' },
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

  const writerCap = await controller.makeWriter({
    label: 'test-writer',
    parentCap: adminCap,
  });
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

test('validateCapabilityChain should pass for non-expired capabilities', async t => {
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  const writerCap = await controller.makeWriter({
    label: 'test-writer',
    parentCap: adminCap,
  });
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test-router',
    parentCap: writerCap,
    ttl: 3600,
  }
  const routerCap = await controller.makeRouter(capOptions, {
    transformFn: 'req => req',
    secrets: { key: 'test' },
  });

  const chain = await controller.getCapabilityChain(routerCap.id);
  await t.notThrowsAsync(() => controller.validateCapabilityChain(chain));
});

test('validateCapabilityChain should fail for expired capabilities', async t => {
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  const writerCap = await controller.makeWriter({
    label: 'test-writer',
    parentCap: adminCap,
  });
  const capOptions: CapabilityOptions = {
    type: 'router',
    label: 'test-router',
    parentCap: writerCap,
    ttl: 1,
  }
  const routerCap = await controller.makeRouter(capOptions, {
    transformFn: 'req => req',
    secrets: { key: 'test' },
  });

  // Wait for 2 seconds to ensure the capability expires
  await new Promise(resolve => setTimeout(resolve, 2000));

  const chain = await controller.getCapabilityChain(routerCap.id);
  await t.throwsAsync(
    () => controller.validateCapabilityChain(chain),
    { message: `Capability ${routerCap.id} has expired` }
  );
});

test('getRouterCapabilitiesForWriter should return only router capabilities for a writer', async t => {
  // Create a fresh admin capability for this test
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability should exist');
    return;
  }

  // Create two writers
  const writerCap1 = await controller.makeWriter({
    label: 'writer-1',
    parentCap: adminCap,
  });
  
  const writerCap2 = await controller.makeWriter({
    label: 'writer-2',
    parentCap: adminCap,
  });
  
  // Create 3 router capabilities under writer 1
  const routerLabels1 = ['router-1a', 'router-1b', 'router-1c'];
  const routers1 = [];
  
  for (const label of routerLabels1) {
    const capOptions: CapabilityOptions = {
      type: 'router',
      label,
      parentCap: writerCap1,
    };
    const router = await controller.makeRouter(capOptions, {
      transformFn: 'req => req',
      secrets: { key: 'test' },
    });
    routers1.push(router);
  }
  
  // Create 2 router capabilities under writer 2
  const routerLabels2 = ['router-2a', 'router-2b'];
  const routers2 = [];
  
  for (const label of routerLabels2) {
    const capOptions: CapabilityOptions = {
      type: 'router',
      label,
      parentCap: writerCap2,
    };
    const router = await controller.makeRouter(capOptions, {
      transformFn: 'req => req',
      secrets: { key: 'test' },
    });
    routers2.push(router);
  }
  
  // Test getRouterCapabilitiesForWriter with writer 1
  const routersForWriter1 = await controller.getRouterCapabilitiesForWriter(writerCap1.id);
  
  // Verify we get exactly the 3 routers created for writer 1
  t.is(routersForWriter1.length, 3, 'Should return exactly 3 router capabilities for writer 1');
  
  // Check that all returned capabilities are routers with the correct parent
  for (const cap of routersForWriter1) {
    t.is(cap.type, 'router', 'Should be a router capability');
    t.is(cap.parentCapId, writerCap1.id, 'Should have writer 1 as parent');
  }
  
  // Verify the returned router labels match what we created
  const returnedLabels = routersForWriter1.map(cap => cap.label).sort();
  t.deepEqual(returnedLabels, routerLabels1.sort(), 'Should return the correct router capabilities');
  
  // Test getRouterCapabilitiesForWriter with writer 2
  const routersForWriter2 = await controller.getRouterCapabilitiesForWriter(writerCap2.id);
  
  // Verify we get exactly the 2 routers created for writer 2
  t.is(routersForWriter2.length, 2, 'Should return exactly 2 router capabilities for writer 2');
  
  // Check that all returned capabilities are routers with the correct parent
  for (const cap of routersForWriter2) {
    t.is(cap.type, 'router', 'Should be a router capability');
    t.is(cap.parentCapId, writerCap2.id, 'Should have writer 2 as parent');
  }
  
  // Verify the returned router labels match what we created for writer 2
  const returnedLabels2 = routersForWriter2.map(cap => cap.label).sort();
  t.deepEqual(returnedLabels2, routerLabels2.sort(), 'Should return the correct router capabilities');
  
  // Test with a non-existent writer ID
  const nonExistentId = '1'.repeat(32);
  const routersForNonExistent = await controller.getRouterCapabilitiesForWriter(nonExistentId);
  t.is(routersForNonExistent.length, 0, 'Should return empty array for non-existent writer');
});