import 'ses';
import 'dotenv/config';
import { createServer } from './server.js';
import { PostgresDB } from './db.js';

lockdown({
  domainTaming: 'unsafe',
});

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const db = new PostgresDB(process.env.DATABASE_URL);
const app = createServer(db);

app.listen(PORT, () => {
  console.log(`Capability URL server listening on port ${PORT}`);
}); 