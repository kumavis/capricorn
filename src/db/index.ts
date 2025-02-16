import crypto from 'crypto';
import { Sequelize } from '@sequelize/core';
import { createSequelize } from './config.js';
import { initCapabilityModel, Capability, CapabilityOptions } from './models/capability.js';
import { initRouterV1Model, RouterV1 } from './models/router_v1.js';


interface DB {
  initDb(): Promise<void>;
  getCapability(id: string): Promise<Capability | null>;
  getRouter(id: string): Promise<RouterV1 | null>;
  getAdminCapability(): Promise<Capability | null>;
  makeCapability(options: CapabilityOptions): Promise<Capability>;
  close(): Promise<void>;
}

export class SequelizeDB implements DB {
  sequelize: Sequelize;

  constructor(connectionString: string) {
    this.sequelize = createSequelize(connectionString);
    initCapabilityModel(this.sequelize);
    initRouterV1Model(this.sequelize);
  }

  async initDb() {
    // Log database info
    const [result] = await this.sequelize.query(`
      SELECT 
        current_database() as database,
        current_schema() as schema,
        current_user as user
    `);
    console.log('Database connection info:', result);

    await this.runMigrations();

    // Create admin capability if it doesn't exist
    const adminCapability = await this.getAdminCapability();
    if (!adminCapability) {
      await this.makeCapability({ type: 'admin', label: 'Admin', parentCap: null });
    }
  }

  async makeCapability(options: CapabilityOptions) {
    const { type, label, parentCap } = options;
    return await Capability.create({
      id: crypto.randomBytes(16).toString('hex'),
      type,
      label,
      parentCapId: parentCap?.id,
    });
  }

  async getCapability(id: string) {
    const capability = await Capability.findByPk(id);
    return capability?.toJSON();
  }

  async getRouter(id: string) {
    const router = await RouterV1.findByPk(id);
    return router;
  }

  async getAdminCapability() {
    const capability = await Capability.findOne({ where: { type: 'admin' } });
    return capability;
  }

  async close() {
    await this.sequelize.close();
  }

  private async runMigrations() {
    // Create version table if it doesn't exist
    await this.sequelize.query(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get current version
    let currentVersion = 0;
    try {
      const [rows] = await this.sequelize.query('SELECT version FROM db_version');
      currentVersion = rows.length ? (rows[0] as any).version : 0;
    } catch (error) {
      console.log('No version found, starting from 0');
    }

    const updateVersion = async (version: number) => {
      await this.sequelize.query(`UPDATE db_version SET version = ${version}, updated_at = CURRENT_TIMESTAMP`);
    }

    const migrations = [
      { version: 1, filename:  '01-initial-schema.js' },
      { version: 2, filename: '02-add-router-v1.js' },
      { version: 3, filename: '03-add-capability-fields.js' },
    ];

    for (const { version, filename } of migrations) {
      if (version > currentVersion) {
        console.log(`Running migration to version ${version}`);
        const { up } = await import(`./migrations/${filename}`);
        await up(this.sequelize);
        await updateVersion(version);
      }
    }
  }
}

// Export the class for use in the app
export { SequelizeDB as DB }; 