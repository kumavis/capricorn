import type { Sequelize } from '@sequelize/core';

export async function up(sequelize: Sequelize) {
  // Add new columns
  await sequelize.query(`
    ALTER TABLE capabilities 
    ADD COLUMN label VARCHAR(255),
    ADD COLUMN parent_cap_id VARCHAR(32) REFERENCES capabilities(id)
  `);

  // Update existing admin capability with a label
  await sequelize.query(`
    UPDATE capabilities 
    SET label = 'Admin'
    WHERE type = 'admin'
  `);

  // Make label required for future inserts
  await sequelize.query(`
    ALTER TABLE capabilities 
    ALTER COLUMN label SET NOT NULL
  `);
}

export async function down(sequelize: Sequelize) {
  await sequelize.query(`
    ALTER TABLE capabilities 
    DROP COLUMN label,
    DROP COLUMN parent_cap_id
  `);
} 