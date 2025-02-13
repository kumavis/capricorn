import express from 'express';
import * as crypto from 'crypto';
import { Request, Response, Application } from 'express';
import { Readable } from 'stream';
import 'ses';

lockdown({
  domainTaming: 'unsafe',
});

const PORT = process.env.PORT || 3000;

interface CapabilityConfig {
  destinationUrl: string;
  transformFunction: (req: Request) => any;
}

// Store capabilities in memory (could be replaced with persistent storage)
const capabilities = new Map<string, CapabilityConfig>();

const app: Application = express();
app.use(express.json());

// Create a new capability URL
app.post('/create-capability', (req: Request, res: Response) => {
  const { destinationUrl, transformFunction } = req.body;

  if (!destinationUrl || !transformFunction) {
    res.status(400).json({ error: 'Missing destinationUrl or transformFunction' });
    return;
  }

  // Generate a unique capability ID
  const capId = crypto.randomBytes(16).toString('hex');

  try {
    // Compile the transform function string into a real function
    const compartment = new Compartment();
    const compiledTransform = compartment.evaluate(`(${transformFunction})`)

    // Store the capability configuration
    capabilities.set(capId, {
      destinationUrl,
      transformFunction: compiledTransform
    });

    // Return the capability URL
    const capabilityUrl = `${req.protocol}://${req.get('host')}/cap/${capId}`;
    res.json({ capabilityUrl });

  } catch (error) {
    res.status(400).json({ error: 'Invalid transform function' });
  }
});

// Handle requests to capability URLs
app.all('/cap/:capId', async (req: Request, res: Response) => {
  const capId = req.params.capId;
  const capability = capabilities.get(capId);

  if (!capability) {
    res.status(404).json({ error: 'Capability not found' });
    return;
  }

  // Transform the request using the stored function
  let transformedRequest;
  try {
    transformedRequest = capability.transformFunction(req);
  } catch (error: any) {
    res.status(500).json({ error: `Error processing capability request: ${error.stack}` });
    return;
  }

  // Forward the transformed request to the destination URL
  const response = await fetch(capability.destinationUrl, {
    method: req.method,
    headers: transformedRequest.headers,
    body: req.method === 'GET' ? undefined : req.body,
  });

  // Forward response headers
  res.status(response.status);
  for (const [key, value] of response.headers) {
    res.setHeader(key, value);
  }

  // Convert web stream to node stream and pipe
  Readable.fromWeb(response.body as any).pipe(res);
});

app.listen(PORT, () => {
  console.log(`Capability URL server listening on port ${PORT}`);
});
