import type { Sequelize } from '@sequelize/core';

export async function up(sequelize: Sequelize) {
  await sequelize.query(`
    CREATE TABLE router_v1 (
      id VARCHAR(32) PRIMARY KEY REFERENCES capabilities(id),
      path_template TEXT,
      ttl_seconds INTEGER,
      transform_fn TEXT NOT NULL,
      secrets TEXT NOT NULL DEFAULT '{}',
      request_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMP
    )
  `);
}

export async function down(sequelize: Sequelize) {
  await sequelize.query('DROP TABLE IF EXISTS router_v1 CASCADE');
} 