import { test } from '../test-helper.js';
import { createTestDb, dropTestDb } from './test-db.js';
import { SequelizeDB } from './index.js';

let db: SequelizeDB;
let testDbInfo: { url: string, schema: string };

test.before(async () => {
  testDbInfo = await createTestDb();
  db = new SequelizeDB(testDbInfo.url);
  await db.initDb();
});

test.after.always(async () => {
  await db.close();
  await dropTestDb(testDbInfo);
});

test('should create admin capability during initialization', async t => {
  const capability = await db.getAdminCapability();
  
  t.truthy(capability, 'Admin capability should exist');
  t.is(capability?.type, 'admin');
  t.is(capability?.id.length, 32, 'Should have 32 character ID');
}); 