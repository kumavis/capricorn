import pg from 'pg';
const { Pool } = pg;

export interface Capability {
  destination_url: string;
  transform_function: string;
}

export interface DB {
  initDb(): Promise<void>;
  storeCapability(id: string, destinationUrl: string, transformFunction: string): Promise<void>;
  getCapability(id: string): Promise<Capability | undefined>;
  close(): Promise<void>;
}

// Postgres implementation
export class PostgresDB implements DB {
  private pool: pg.Pool | null = null;
  private schema: string;

  constructor(private connectionString: string, schema = 'public') {
    this.schema = schema;
  }

  private async getPool(): Promise<pg.Pool> {
    if (!this.pool) {
      this.pool = new Pool({ connectionString: this.connectionString });
      await this.pool.query(`SET search_path TO ${this.schema}`);
    }
    return this.pool;
  }

  async initDb() {
    const pool = await this.getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS capabilities (
        id TEXT PRIMARY KEY,
        destination_url TEXT NOT NULL,
        transform_function TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async storeCapability(id: string, destinationUrl: string, transformFunction: string) {
    const pool = await this.getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO capabilities (id, destination_url, transform_function) VALUES ($1, $2, $3)',
        [id, destinationUrl, transformFunction]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCapability(id: string) {
    const pool = await this.getPool();
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT destination_url, transform_function FROM capabilities WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
} 