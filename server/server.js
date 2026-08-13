const express = require('express');
const http = require('http');
const ws = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON requests
app.use(express.json());

// Serve static frontend dashboard from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Create combined HTTP & WebSocket server
const server = http.createServer(app);
const wss = new ws.WebSocketServer({ noServer: true });

// Handle WebSocket upgrades at '/stream'
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/stream') {
    wss.handleUpgrade(request, socket, head, (wsClient) => {
      wss.emit('connection', wsClient, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket Connection Management
wss.on('connection', (wsClient, request) => {
  console.log(`[WebSocket] Client connected from ${request.socket.remoteAddress}`);
  
  wsClient.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });

  wsClient.on('error', (err) => {
    console.error('[WebSocket] Client error:', err);
  });
});

// Helper validation functions
function isValidEvent(event) {
  const allowedEvents = ['thinking', 'planning', 'executing_tool', 'task_done', 'task_error'];
  return allowedEvents.includes(event);
}

// POST endpoint for Telemetry Logs
app.post('/api/telemetry', (req, res) => {
  const { event, message, timestamp, metadata } = req.body;

  // Validate request payload
  if (!event || !message) {
    return res.status(400).json({ error: 'Missing required fields: event and message are required.' });
  }

  if (!isValidEvent(event)) {
    return res.status(400).json({ error: `Invalid event type: "${event}". Must be one of: thinking, planning, executing_tool, task_done, task_error.` });
  }

  // Build normalized telemetry log
  const telemetryData = {
    timestamp: timestamp || new Date().toISOString(),
    event,
    message,
    metadata: metadata || {}
  };

  // Broadcast to all active WebSocket clients
  const payloadString = JSON.stringify(telemetryData);
  let clientsNotified = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === ws.OPEN) {
      client.send(payloadString);
      clientsNotified++;
    }
  });

  console.log(`[Telemetry] Broadcast event "${event}" to ${clientsNotified} client(s): "${message}"`);
  return res.status(200).json({ status: 'success', clientsNotified });
});

// Start listening
server.listen(port, () => {
  console.log(`[Server] OrchestrateLive Bridge Server listening at http://localhost:${port}`);
});
