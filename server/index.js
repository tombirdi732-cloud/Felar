import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import routes from './routes.js';
import { attachWebSocket } from './ws.js';
import { uploadsDir } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '256kb' }));

// CORS: desktop/mobile clients connect from a different origin
// (file://, capacitor://, or another host), so allow cross-origin API calls.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api', routes);

// Serve uploaded files (avatars, attachments).
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// Serve the SPA.
const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(join(publicDir, 'index.html')));

const server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`Roost server running on http://localhost:${PORT}`);
});
