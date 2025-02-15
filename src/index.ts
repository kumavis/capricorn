import 'ses';
import 'dotenv/config';
import { createServer } from './server.js';
import { DB } from './db/index.js';
import { CapabilityController } from './controller.js';


lockdown({
  domainTaming: 'unsafe',
});

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const db = new DB(process.env.DATABASE_URL);
const controller = new CapabilityController(db);
const app = createServer(controller);

// Initialize database before starting server
await db.initDb();

app.listen(PORT, () => {
  console.log(`Capability URL server listening on port ${PORT}`);
});

// Log admin capability ID
// const capability = await controller.getAdminCapability();
const capability = await db.getAdminCapability();
console.log(`Admin capability: ${capability?.id}`);