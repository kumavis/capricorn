import type { DB } from './db/index.js';
import { createRouterV1, type RouterV1, type RouterV1Options } from './db/models/router_v1.js';

import { Capability } from './db/models/capability.js';

/**
 * controller methods assume the capability chain is already validated.
 * they do not check the chain again. They only check that the parent capability is valid for the action.
 */

export type RequestObj = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

const compileTransformFn = (transformFn: string) => {
  const compartment = new Compartment({ atob, btoa });
  return compartment.evaluate(`(${transformFn})`);
}

export class CapabilityController {
  constructor(private db: DB) {
    this.db = db;
  }

  async getAdminCapability() {
    return await this.db.getAdminCapability();
  }

  async getCapability(capId: string) {
    return await this.db.getCapability(capId);
  }

  async makeWriter(parentCap: Capability, label: string): Promise<Capability> {
    const writerCap = await this.db.makeCapability({ type: 'writer', label, parentCap });
    return writerCap;
  }

  async makeRouter(writerCap: Capability, label: string, options: RouterV1Options): Promise<RouterV1> {
    // Verify writer capability
    if (!writerCap || (writerCap.type !== 'writer' && writerCap.type !== 'admin')) {
      throw new Error('Invalid writer capability');
    }

    try {
      compileTransformFn(options.transformFn);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Invalid transform function: ${errorMessage}`);
    }

    // Create router capability
    const routerCap = await this.db.makeCapability({ type: 'router', label, parentCap: writerCap });
    
    // Create router config
    const router = await createRouterV1(routerCap, options);
    return router;
  }

  async getRouter(routerId: string): Promise<RouterV1 | null> {
    const routerCap = await this.db.getCapability(routerId);
    if (!routerCap || routerCap.type !== 'router') {
      throw new Error('Invalid router capability');
    }
    const router = await this.db.getRouter(routerId);
    if (!router) {
      throw new Error('Router not found');
    }
    return router;
  }

  async processRouter(routerId: string, request: RequestObj) {
    const router = await this.getRouter(routerId);
    if (!router) {
      throw new Error('Router not found');
    }

    const transformFn = compileTransformFn(router.transformFn);
    const secrets = JSON.parse(router.secrets);
    const pathTemplate = router.pathTemplate;

    let processedRequest: Request;
    try {
      processedRequest = await transformFn(request, secrets);
    } catch (error) {
      throw new Error(`Error processing request: ${error}`);
    }
    return processedRequest;
  }

  async getCapabilityChain(capId: string): Promise<Capability[]> {
    // Use recursive CTE to get the full chain
    const rows = await this.db.sequelize.query(`
      WITH RECURSIVE chain AS (
        -- Base case: start with the given capability
        SELECT id, type, label, parent_cap_id, 0 as depth
        FROM capabilities 
        WHERE id = :capId

        UNION ALL

        -- Recursive case: join with parent capabilities
        SELECT c.id, c.type, c.label, c.parent_cap_id, chain.depth + 1
        FROM capabilities c
        INNER JOIN chain ON chain.parent_cap_id = c.id
      )
      -- Order by depth descending to get root first
      SELECT id, type, label, parent_cap_id as "parentCapId"
      FROM chain
      ORDER BY depth DESC
    `, {
      replacements: { capId },
      type: 'SELECT',
      // logging: console.log // Log the actual SQL query
    });

    return rows as Capability[];
  }

  async validateCapabilityChain(chain: Capability[]): Promise<void> {
    if (chain.length === 0) {
      throw new Error('Capability chain must not be empty');
    }
    // Validate root is admin
    if (chain[0].type !== 'admin') {
      throw new Error('Capability chain must start with admin capability');
    }
  }
}
