import pg from 'pg';
const { Pool } = pg;

export async function createTestDb() {
  // Connect to postgres to create test database
  const rootPool = new Pool({
    connectionString: 'postgres://localhost:5432/postgres'
  });

  const dbName = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const schemaName = `schema_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  try {
    await rootPool.query(`CREATE DATABASE ${dbName}`);
    
    // Create and connect to test database
    const testPool = new Pool({
      connectionString: `postgres://localhost:5432/${dbName}`
    });
    
    try {
      // Create unique schema
      await testPool.query(`CREATE SCHEMA ${schemaName}`);
      await testPool.query(`SET search_path TO ${schemaName}`);
      
      // Test connection
      await testPool.query('SELECT 1');
    } finally {
      await testPool.end();
    }
    
  } finally {
    await rootPool.end();
  }

  // Return connection info
  return {
    url: `postgres://localhost:5432/${dbName}`,
    schema: schemaName
  };
}

export async function dropTestDb(dbInfo: { url: string, schema: string }) {
  const dbName = dbInfo.url.split('/').pop();
  
  // Connect to postgres to drop test database
  const rootPool = new Pool({
    connectionString: 'postgres://localhost:5432/postgres'
  });

  try {
    // Wait for all connections to finish
    await rootPool.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = $1 
        AND pid <> pg_backend_pid()
        AND state = 'active'
    `, [dbName]);

    // Drop the database
    await rootPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  } finally {
    await rootPool.end();
  }
} 