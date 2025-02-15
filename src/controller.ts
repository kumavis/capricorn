import type { DB } from './db/index.js';
import { createRouterV1, type RouterV1, type RouterV1Options } from './db/models/router_v1.js';


export type RequestObj = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export class CapabilityController {
  constructor(private db: DB) {}

  async getAdminCapability() {
    return await this.db.getAdminCapability();
  }

  async getCapability(capId: string) {
    return await this.db.getCapability(capId);
  }

  async makeRouter(adminCapId: string, options: RouterV1Options): Promise<string> {
    // Verify admin capability
    const adminCap = await this.db.getCapability(adminCapId);
    if (!adminCap || adminCap.type !== 'admin') {
      throw new Error('Invalid admin capability');
    }

    // Create router capability
    const routerCap = await this.db.makeCapability('router');
    
    // Create router config
    const router = await createRouterV1(routerCap, options);
    return router.id;
  }

  async getRouter(routerId: string) {
    const routerCap = await this.db.getCapability(routerId);
    if (!routerCap || routerCap.type !== 'router') {
      throw new Error('Invalid router capability');
    }
    const router = await this.db.getRouter(routerId);
    return router;
  }

  async processRouter(routerId: string, request: RequestObj) {
    const router = await this.getRouter(routerId);
    if (!router) {
      throw new Error('Router not found');
    }
    const compartment = new Compartment();
    const transformFn = compartment.evaluate(`(${router.transformFn})`);
    const secrets = JSON.parse(router.secrets);
    const pathTemplate = router.pathTemplate;

    let processedRequest: Request;
    try {
      processedRequest = await transformFn(request, secrets);
    } catch (error) {
      throw new Error('Error processing request');
    }
    return processedRequest;
  }
}
