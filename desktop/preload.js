// Preload runs in an isolated context before the page loads.
// Exposes a minimal, safe bridge; extend as needed (notifications, etc.).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('felarDesktop', {
  platform: process.platform,
  isDesktop: true,
});
