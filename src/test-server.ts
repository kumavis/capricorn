import express from 'express';
import type { Server } from 'http';

export function createTestServer() {
  const app = express();
  let server: Server;

  app.use(express.json());

  // Echo endpoint that returns request headers and body
  app.all('/echo', (req, res) => {
    res.json({
      headers: req.headers,
      body: req.body,
      method: req.method
    });
  });

  return {
    start: () => new Promise<string>(resolve => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        resolve(`http://localhost:${port}`);
      });
    }),
    stop: () => new Promise<void>(resolve => {
      server.close(() => resolve());
    })
  };
} 