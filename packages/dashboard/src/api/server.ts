import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const app = express();
const PORT = 4400;

// Enable CORS for localhost origins
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    /^http:\/\/localhost:\d+$/
  ]
}));

// JSON body parser
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbPath = path.join(os.homedir(), '.noxdev', 'ledger.db');

  let dbOk = false;
  try {
    if (existsSync(dbPath)) {
      await access(dbPath, constants.R_OK);
      dbOk = true;
    }
  } catch (error) {
    // DB not accessible
  }

  res.json({
    status: 'ok',
    db: dbOk
  });
});

// Mount API routes at /api (routes will be defined in T2)
// app.use('/api', apiRoutes);

export { app };

export function start() {
  app.listen(PORT, () => {
    console.log(`noxdev dashboard API running at http://localhost:${PORT}`);
  });
}

// When run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}