import request from 'supertest';
import { test } from './test-helper.js';
import { createServer } from './server.js';
import { createTestDb, dropTestDb } from './db/test-db.js';
import { DB } from './db/index.js';
import { createTestServer } from './test-server.js';
import { CapabilityController } from './controller.js';

let app: ReturnType<typeof createServer>;
let testDbInfo: { url: string, schema: string };
let db: DB;
let controller: CapabilityController;
let testServer: { start: () => Promise<string>, stop: () => Promise<void> };
let testServerUrl: string;

test.before(async () => {
  // Create test database
  testDbInfo = await createTestDb();
  
  // Create database instance with unique schema
  db = new DB(testDbInfo.url);
  controller = new CapabilityController(db);
  // Create server with test database
  app = createServer(controller);
  
  // Initialize database schema
  await db.initDb();

  // Start test HTTP server
  testServer = createTestServer();
  testServerUrl = await testServer.start();
});

test.after.always(async () => {
  // Clean up
  await db.close();
  await dropTestDb(testDbInfo);
  await testServer.stop();
});

test('should create and use a capability URL', async t => {
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability not found');
    return;
  }
  const createResponse = await request(app)
    .post(`/cap/${adminCap.id}/router`)
    .send({
      secrets: {
        url: `${testServerUrl}/echo`,
        test: 'hello',
      },
      transformFn: `(req, { url, test }) => ({ url, headers: { "X-Test": test } })`,
      ttl: 123,
    });

  t.is(createResponse.status, 200);
  t.truthy(createResponse.body.routerId);
  t.truthy(createResponse.body.capabilityUrl);

  const capId = createResponse.body.routerId;
  t.is(capId.length, 32);

  // Verify capability was stored
  const capability = await controller.getCapability(capId);
  if (!capability) {
    t.fail('Capability should be stored in database');
    return;
  }
  t.is(capability.ttl, 123);
  
  const router = await controller.getRouter(capId);
  if (!router) {
    t.fail('Router should be stored in database');
    return;
  }
  // Use capability
  const useResponse = await request(app)
    .get(`/cap/${capId}`);

  t.is(useResponse.status, 200);
  t.is(useResponse.body.headers['x-test'], 'hello');
});

test('should return 404 for non-existent capability', async t => {
  const response = await request(app)
    .get('/cap/12345678901234567890123456789012');

  t.is(response.status, 404);
});

test('should return 400 for invalid capability ID', async t => {
  const response = await request(app)
    .get('/cap/invalid');

  t.is(response.status, 400);
  t.deepEqual(response.body, { error: 'Invalid capability ID' });
});

test('should create writer capability using admin capability', async t => {
  // Get admin capability
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability not found');
    return;
  }

  // Create writer capability
  const createResponse = await request(app)
    .post(`/cap/${adminCap.id}/write`)
    .send({
      label: 'test-writer'
    });

  t.is(createResponse.status, 200);
  t.truthy(createResponse.body.capabilityUrl);
  t.truthy(createResponse.body.writerCapId);

  const writerId = createResponse.body.writerCapId;
  t.is(writerId.length, 32);

  // Verify writer capability was stored
  const writerCap = await controller.getCapability(writerId);
  if (!writerCap) {
    t.fail('Writer capability should exist');
    return;
  }
  t.is(writerCap.type, 'writer');
  t.is(writerCap.label, 'test-writer');
  t.is(writerCap.parentCapId, adminCap.id);
});

test('should require label when creating writer', async t => {
  const adminCap = await controller.getAdminCapability();
  if (!adminCap) {
    t.fail('Admin capability not found');
    return;
  }

  const response = await request(app)
    .post(`/cap/${adminCap.id}/write`)
    .send({});

  t.is(response.status, 400);
  t.deepEqual(response.body, { error: 'Label is required' });
});
