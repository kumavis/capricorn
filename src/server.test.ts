import request from 'supertest';
import { test } from './test-helper.js';
import { createServer } from './server.js';
import { createTestDb, dropTestDb } from './db/test-db.js';
import { DB } from './db/index.js';
import { createTestServer } from './test-server.js';

let app: ReturnType<typeof createServer>;
let testDbInfo: { url: string, schema: string };
let db: DB;
let testServer: { start: () => Promise<string>, stop: () => Promise<void> };
let testServerUrl: string;

test.before(async () => {
  // Create test database
  testDbInfo = await createTestDb();
  
  // Create database instance with unique schema
  db = new DB(testDbInfo.url);
  
  // Create server with test database
  app = createServer(db);
  
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

// test('should create and use a capability URL', async t => {
//   // Create capability
//   const createResponse = await request(app)
//     .post('/create-capability')
//     .send({
//       destinationUrl: `${testServerUrl}/echo`,
//       transformFunction: 'req => ({ headers: { "X-Test": "hello" } })'
//     });

//   t.is(createResponse.status, 200);
//   t.truthy(createResponse.body.capabilityUrl);

//   const capId = createResponse.body.capabilityUrl.split('/cap/')[1];
//   t.is(capId.length, 32);

//   // Verify capability was stored
//   const capability = await db.getCapability(capId);
//   t.truthy(capability, 'Capability should be stored in database');
//   t.is(capability.destination_url, `${testServerUrl}/echo`);

//   // Use capability
//   const useResponse = await request(app)
//     .get(`/cap/${capId}`);

//   t.is(useResponse.status, 200);
//   t.is(useResponse.body.headers['x-test'], 'hello');
// });

// test('should return 404 for non-existent capability', async t => {
//   const response = await request(app)
//     .get('/cap/12345678901234567890123456789012');

//   t.is(response.status, 404);
// });

// test('should return 400 for invalid capability ID', async t => {
//   const response = await request(app)
//     .get('/cap/invalid');

//   t.is(response.status, 400);
//   t.deepEqual(response.body, { error: 'Invalid capability ID' });
// });
