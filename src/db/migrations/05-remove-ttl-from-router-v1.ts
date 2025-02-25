import type { Sequelize } from '@sequelize/core';

export async function up(sequelize: Sequelize) {
  await sequelize.query(`
    ALTER TABLE router_v1 
    DROP COLUMN IF EXISTS ttl_seconds
  `);
}

export async function down(sequelize: Sequelize) {
  await sequelize.query(`
    ALTER TABLE router_v1 
    ADD COLUMN ttl_seconds INTEGER
  `);
} 