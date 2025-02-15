import express from 'express';
import { Request, Response, Application } from 'express';
import { Readable } from 'stream';
import { CapabilityController, RequestObj } from './controller.js';
import { RouterV1 } from './db/models/router_v1.js';


export function createServer(controller: CapabilityController): Application {
  const app = express();
  app.use(express.json());

  // Handle requests to capability URLs
  app.all('/cap/:capId', handleCapabilityRequest);
  app.all('/cap/:capId/:remainingPath(*)', handleCapabilityRequest);

  async function handleCapabilityRequest (req: Request, res: Response) {
    const capId = req.params.capId;
    if (!capId || typeof capId !== 'string' || capId.length !== 32) {
      res.status(400).json({ error: 'Invalid capability ID' });
      return;
    }
    const capability = await controller.getCapability(capId);
    if (!capability) {
      res.status(404).json({ error: 'Capability not found' });
      return;
    }

    switch (capability.type) {
      case 'admin': {
        const { remainingPath } = req.params;
        if (remainingPath === 'create-router' && req.method === 'POST') {
          const { pathTemplate, secrets, transformFunction, ttlSeconds } = req.body;
          const routerId = await controller.makeRouter(capId, {
            pathTemplate: pathTemplate,
            transformFn: transformFunction,
            ttlSeconds: ttlSeconds,
            secrets: secrets,
          });
          const capabilityUrl = `${req.protocol}://${req.get('host')}/cap/${routerId}`;
          res.json({ routerId, capabilityUrl });
          return;
        }
        res.status(405).json({ error: 'Admin capability can only be used for GET requests' });
      }
      case 'router': {
        const router = await controller.getRouter(capId);
        if (!router) {
          res.status(404).json({ error: 'Router not found' });
          return;
        }
        handleRouterRequest(router, req, res);
        break;
      }
      default: {
        res.status(400).json({ error: `Invalid capability type: ${capability.type}` });
        break;
      }
    }
  }

  async function handleRouterRequest(router: RouterV1, req: Request, res: Response) {
    const reqObj: RequestObj = {
      url: req.url,
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.body,
    }
    const transformedRequest = await controller.processRouter(router.id, reqObj);
    // Forward the request to the destination URL
    const response = await fetch(transformedRequest.url, {
      method: req.method,
      headers: transformedRequest.headers,
      body: req.method === 'GET' ? undefined : req.body,
    });
    res.status(response.status);
    for (const [key, value] of response.headers) {
      res.setHeader(key, value);
    }
    // Forward the response body
    const stream = Readable.fromWeb(response.body as any);
    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming response' });
      }
    });
    stream.pipe(res);
    req.on('close', () => {
      stream.destroy();
    });
  }

  return app;
}