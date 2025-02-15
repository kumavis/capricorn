import { Sequelize } from '@sequelize/core';

export async function createTestDb() {
  // Connect to postgres to create test database
  const rootDb = new Sequelize({
    dialect: 'postgres',
    url: 'postgres://localhost:5432/postgres',
    logging: false
  });

  const dbName = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  try {
    await rootDb.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await rootDb.close();
  }

  return {
    url: `postgres://localhost:5432/${dbName}`,
    schema: 'public'  // We'll use default schema since Sequelize handles this
  };
}

export async function dropTestDb(dbInfo: { url: string, schema: string }) {
  const dbName = dbInfo.url.split('/').pop();
  
  // Connect to postgres to drop test database
  const rootDb = new Sequelize({
    dialect: 'postgres',
    url: 'postgres://localhost:5432/postgres',
    logging: false
  });

  try {
    // Terminate active connections
    await rootDb.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = :dbName 
        AND pid <> pg_backend_pid()
        AND state = 'active'
    `, {
      replacements: { dbName }
    });

    // Drop the database
    await rootDb.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  } finally {
    await rootDb.close();
  }
} 