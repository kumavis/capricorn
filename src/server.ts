import express from 'express';
import * as crypto from 'crypto';
import { Request, Response, Application } from 'express';
import { Readable } from 'stream';
import type { DB } from './db.js';

export function createServer(db: DB): Application {
  const app = express();
  app.use(express.json());

  // Initialize database on startup
  db.initDb().catch(console.error);

  // Create a new capability URL
  app.post('/create-capability', async (req: Request, res: Response) => {
    const { destinationUrl, transformFunction } = req.body;

    if (!destinationUrl || !transformFunction) {
      res.status(400).json({ error: 'Missing destinationUrl or transformFunction' });
      return;
    }

    const capId = crypto.randomBytes(16).toString('hex');

    try {
      // Test compile the function first
      const compartment = new Compartment();
      compartment.evaluate(`(${transformFunction})`);

      // Store in database
      await db.storeCapability(capId, destinationUrl, transformFunction);

      const capabilityUrl = `${req.protocol}://${req.get('host')}/cap/${capId}`;
      res.json({ capabilityUrl });

    } catch (error) {
      res.status(400).json({ error: 'Invalid transform function' });
    }
  });

  // Handle requests to capability URLs
  app.all('/cap/:capId', async (req: Request, res: Response) => {
    const capId = req.params.capId;
    if (!capId || typeof capId !== 'string' || capId.length !== 32) {
      res.status(400).json({ error: 'Invalid capability ID' });
      return;
    }
    const capability = await db.getCapability(capId);

    if (!capability) {
      res.status(404).json({ error: 'Capability not found' });
      return;
    }

    let transformedRequest;
    try {
      const compartment = new Compartment();
      const transformFunction = compartment.evaluate(`(${capability.transform_function})`);
      transformedRequest = transformFunction(req);
    } catch (error: any) {
      res.status(500).json({ error: `Error processing capability request: ${error.stack}` });
      return;
    }

    // Forward the transformed request to the destination URL
    const response = await fetch(capability.destination_url, {
      method: req.method,
      headers: transformedRequest.headers,
      body: req.method === 'GET' ? undefined : req.body,
    });

    // Forward response headers
    res.status(response.status);
    for (const [key, value] of response.headers) {
      res.setHeader(key, value);
    }

    // Convert web stream to node stream and pipe with error handling
    const stream = Readable.fromWeb(response.body as any);
    stream.pipe(res);

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming response' });
      }
      res.end();
    });

    // Ensure cleanup on client disconnect
    req.on('close', () => {
      stream.destroy();
    });
  });


  return app;
} 