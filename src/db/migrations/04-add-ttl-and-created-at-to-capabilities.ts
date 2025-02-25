import type { Sequelize } from '@sequelize/core';

export async function up(sequelize: Sequelize) {
  await sequelize.query(`
    ALTER TABLE capabilities 
    ADD COLUMN ttl INTEGER,
    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  `);
}

export async function down(sequelize: Sequelize) {
  await sequelize.query(`
    ALTER TABLE capabilities 
    DROP COLUMN ttl,
    DROP COLUMN created_at
  `);
}