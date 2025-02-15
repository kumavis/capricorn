import type { Sequelize } from '@sequelize/core';
import crypto from 'crypto';

export async function up(sequelize: Sequelize) {
  // Drop existing table if it exists
  await sequelize.query('DROP TABLE IF EXISTS capabilities CASCADE');

  // Create new table
  await sequelize.query(`
    CREATE TABLE capabilities (
      id VARCHAR(32) PRIMARY KEY,
      type VARCHAR(255) NOT NULL
    )
  `);

  // Create admin capability
  const adminId = crypto.randomBytes(16).toString('hex');
  await sequelize.query(`
    INSERT INTO capabilities (id, type) VALUES (?, 'admin')
  `, {
    replacements: [adminId]
  });
}

export async function down(sequelize: Sequelize) {
  await sequelize.query('DROP TABLE IF EXISTS capabilities CASCADE');
}
