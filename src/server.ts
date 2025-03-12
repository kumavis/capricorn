import path from 'path';
import express from 'express';
import { Request, Response, Application } from 'express';
import { Readable } from 'stream';
import { engine } from 'express-handlebars';
import { CapabilityController, RequestObj } from './controller.js';
import { RouterV1 } from './db/models/router_v1.js';
import { Capability, CapabilityOptions, labelForCapabilityChain } from './db/models/capability.js';

const __dirname = import.meta.dirname;

export function createServer(controller: CapabilityController): Application {
  const app = express();
  app.engine('handlebars', engine());
  app.set('view engine', 'handlebars');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.json());

  // Handle requests to capability URLs
  app.all('/cap/:capId{/*remainingPath}', handleCapabilityRequest);

  async function handleCapabilityRequest (req: Request, res: Response) {
    try {
      const capId = req.params.capId;
      if (!capId || typeof capId !== 'string' || capId.length !== 32) {
        res.status(400).json({ error: 'Invalid capability ID' });
        return;
      }
      const capabilityChain = await controller.getCapabilityChain(capId);
      if (capabilityChain.length === 0) {
        res.status(404).json({ error: 'Capability not found' });
        return;
      }
      try {
        controller.validateCapabilityChain(capabilityChain);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: `Invalid capability chain: ${errorMessage}` });
        return;
      }
      const capability = capabilityChain[capabilityChain.length - 1];
      switch (capability.type) {
        case 'admin': {
          await handleAdminRequest(capability, req, res);
        break;
      }
      case 'writer': {
        await handleWriterRequest(capability, req, res);
        break;
      }
      case 'router': {
        const router = await controller.getRouter(capId);
        if (!router) {
          res.status(404).json({ error: 'Router not found' });
          return;
        }
        await handleRouterRequest(router, req, res);
        break;
      }
      default: {
          res.status(400).json({ error: `Invalid capability type: ${capability.type}` });
          break;
        }
      }
    } catch (error) {
      console.error('Error handling capability request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function makeRouter(parentCap: Capability, req: Request, res: Response) {
    const { label = 'route', pathTemplate, secrets, transformFn, ttl, ...otherParams } = req.body;
    if (!label) {
      res.status(400).json({ error: 'Label is required' });
      return;
    }
    if (!transformFn) {
      res.status(400).json({ error: 'Transform function is required' });
      return;
    }
    if (Object.keys(otherParams).length > 0) {
      res.status(400).json({ error: `Unknown parameters: ${Object.keys(otherParams).join(', ')}` });
      return;
    }
    const capOptions: CapabilityOptions = {
      type: 'router',
      label,
      parentCap,
      ttl,
    }
    const routerCap = await controller.makeRouter(capOptions, {
      pathTemplate,
      transformFn,
      secrets,
    });
    const capabilityUrl = makeCapabilityUrl(req, routerCap.id);
    res.json({ routerId: routerCap.id, capabilityUrl });
  }

  async function makeWriter(parentCap: Capability, req: Request, res: Response) {
    const { label, ttl, ...otherParams } = req.body;
    if (!label) {
      res.status(400).json({ error: 'Label is required' });
      return;
    }
    if (Object.keys(otherParams).length > 0) {
      res.status(400).json({ error: `Unknown parameters: ${Object.keys(otherParams).join(', ')}` });
      return;
    }

    const writerCap = await controller.makeWriter({
      label,
      parentCap,
      ttl
    });
    const capabilityUrl = makeCapabilityUrl(req, writerCap.id);
    res.json({ writerCapId: writerCap.id, capabilityUrl });
  }

  async function renderAdmin(req: Request, res: Response) {
    const capabilities = await controller.getAllCapabilities();

    // Get current time from database to ensure consistency
    const now = await controller.getCurrentTime();
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    
    // Prepare capabilities with URL and TTL information
    const capabilitiesWithUrl = capabilities.map(cap => {
      const capData = cap.get({ plain: true });
      let ttlStatus = null;
      
      if (capData.ttl !== null) {
        const createdAt = new Date(capData.createdAt);
        const expirationTime = new Date(createdAt.getTime() + capData.ttl * 1000);
        const timeDiff = expirationTime.getTime() - now.getTime();
        
        if (timeDiff <= 0) {
          ttlStatus = {
            expired: true,
            expirationTime,
            message: 'Expired'
          };
        } else {
          // Calculate time units for RelativeTimeFormat
          const seconds = Math.floor(timeDiff / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);
          
          let timeRemaining;
          if (days > 0) {
            timeRemaining = rtf.format(days, 'day');
          } else if (hours > 0) {
            timeRemaining = rtf.format(hours, 'hour');
          } else if (minutes > 0) {
            timeRemaining = rtf.format(minutes, 'minute');
          } else {
            timeRemaining = rtf.format(seconds, 'second');
          }
          
          ttlStatus = {
            expired: false,
            expirationTime,
            message: `Expires ${timeRemaining}`,
            timeRemaining
          };
        }
      }
      
      return {
        ...capData,
        url: makeCapabilityUrl(req, cap.id),
        ttlStatus
      };
    });
    
    res.render('admin', { capabilities: capabilitiesWithUrl });
  }

  async function handleAdminRequest(adminCap: Capability, req: Request, res: Response) {
    const remainingPath = getRemainingPath(req.params);
    if (req.method === 'GET') {
      if (req.accepts('html')) {
        await renderAdmin(req, res);
        return;
      }
    }
    if (req.method === 'POST') {
      if (remainingPath === 'router') {
        await makeRouter(adminCap, req, res);
        return;
      }
      if (remainingPath === 'write') {
        await makeWriter(adminCap, req, res);
        return;
      }
    }
    res.status(405).json({ error: 'Unknown request for admin capability' });
  }

  async function handleWriterRequest(writerCap: Capability, req: Request, res: Response) {
    const remainingPath = getRemainingPath(req.params);
    if (remainingPath === 'write' && req.method === 'POST') {
      await makeWriter(writerCap, req, res);
      return;
    }
    if (remainingPath === 'router' && req.method === 'POST') {
      await makeRouter(writerCap, req, res);
      return;
    }
    res.status(405).json({ error: 'Unknown request for writer capability' });
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

function makeCapabilityUrl(req: Request, capId: string) {
  const host = req.get('host') || 'localhost';
  const isLocalhost = host.startsWith('localhost');
  const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  const protocol = isLocalhost || isIpAddress ? 'http' : 'https';
  const url = `${protocol}://${host}/cap/${capId}`;
  return url;
}

function getRemainingPath(params: Record<string, unknown>) {
  const remainingPath = params.remainingPath as string[] | undefined;
  return remainingPath ? remainingPath.join('/') : '';
}
