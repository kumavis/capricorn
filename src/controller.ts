import type { DB } from './db/index.js';
import { createRouterV1, type RouterV1, type RouterV1Options } from './db/models/router_v1.js';

import { Capability, CapabilityOptions } from './db/models/capability.js';

export type CapabilityOptionsNoType = Omit<CapabilityOptions, 'type'>;

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
  
  async getAllCapabilities(type?: string): Promise<Capability[]> {
    return await this.db.getAllCapabilities(type);
  }

  async getRouterCapabilitiesForWriter(writerCapId: string): Promise<Capability[]> {
    // Get all router capabilities that have this writer as their parent
    return await this.db.getCapabilitiesByParentAndType(writerCapId, 'router');
  }

  async getAdminCapability() {
    return await this.db.getAdminCapability();
  }

  async getCapability(capId: string) {
    return await this.db.getCapability(capId);
  }

  async makeWriter(capOptions: CapabilityOptionsNoType): Promise<Capability> {
    const writerCap = await this.db.makeCapability({ ...capOptions, type: 'writer' });
    return writerCap;
  }

  async makeRouter(capOptions: CapabilityOptionsNoType, options: RouterV1Options): Promise<RouterV1> {
    // Verify writer capability
    const writerCap = capOptions.parentCap;
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
    const routerCap = await this.db.makeCapability({ ...capOptions, type: 'router' });
    
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
        SELECT *, 0 as depth
        FROM capabilities 
        WHERE id = :capId

        UNION ALL

        -- Recursive case: join with parent capabilities
        SELECT c.*, chain.depth + 1
        FROM capabilities c
        INNER JOIN chain ON chain.parent_cap_id = c.id
      )
      -- Order by depth descending to get root first
      SELECT *
      FROM chain
      ORDER BY depth DESC
    `, {
      replacements: { capId },
      model: Capability,
      mapToModel: true,
      type: 'SELECT',
      // logging: console.log // Log the actual SQL query
    });


    return rows as Capability[];
  }

  validateCapability(cap: Capability, now: Date) {
    // validate ttl if it exists
    if (cap.ttl !== null) {
      const createdAt = cap.createdAt;
      const expirationTime = new Date(createdAt.getTime() + cap.ttl * 1000);
      const timeDiff = expirationTime.getTime() - now.getTime();
      if (timeDiff <= 0) {
        throw new Error(`Capability ${cap.id} has expired`);
      }
    }
  }
  
  async getCurrentTime(): Promise<Date> {
    return await this.db.getCurrentTime();
  }

  async validateCapabilityChain(chain: Capability[]): Promise<void> {
    if (chain.length === 0) {
      throw new Error('Capability chain must not be empty');
    }
    // Validate root is admin
    if (chain[0].type !== 'admin') {
      throw new Error('Capability chain must start with admin capability');
    }

    const now = await this.db.getCurrentTime();
    for (const cap of chain) {
      this.validateCapability(cap, now);
    }
  }
}
