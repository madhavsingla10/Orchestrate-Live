const express = require('express');
const http = require('http');
const ws = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON requests
app.use(express.json());

// Serve static frontend dashboard from public folder with no-cache headers
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

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

// Broadcast to all active WebSocket clients
function broadcastTelemetry(telemetryData) {
  const payloadString = JSON.stringify(telemetryData);
  let clientsNotified = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === ws.OPEN) {
      client.send(payloadString);
      clientsNotified++;
    }
  });
  return clientsNotified;
}

// POST endpoint for Telemetry Logs (for backwards compatibility/manual triggers)
app.post('/api/telemetry', (req, res) => {
  const { event, message, timestamp, metadata } = req.body;

  if (!event || !message) {
    return res.status(400).json({ error: 'Missing required fields: event and message are required.' });
  }

  if (!isValidEvent(event)) {
    return res.status(400).json({ error: `Invalid event type: "${event}".` });
  }

  const telemetryData = {
    timestamp: timestamp || new Date().toISOString(),
    event,
    message,
    metadata: metadata || {}
  };

  const clientsNotified = broadcastTelemetry(telemetryData);
  console.log(`[HTTP Telemetry] Broadcast event "${event}" to ${clientsNotified} client(s): "${message}"`);
  return res.status(200).json({ status: 'success', clientsNotified });
});

// --- TRANSCRIPT LOG WATCHER ENGINE ---

function getBrainDir() {
  const customPath = 'C:\\Users\\rakes\\.gemini\\antigravity-cli\\brain';
  if (fs.existsSync(customPath)) return customPath;

  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const fallbackPath = path.join(homeDir, '.gemini/antigravity-cli/brain');
  if (fs.existsSync(fallbackPath)) return fallbackPath;

  return null;
}

function getLatestTranscriptPath() {
  const brainDir = getBrainDir();
  if (!brainDir) return null;

  try {
    const folders = fs.readdirSync(brainDir);
    let latestFile = null;
    let latestMtime = 0;

    folders.forEach(folder => {
      const transcriptPath = path.join(brainDir, folder, '.system_generated/logs/transcript.jsonl');
      if (fs.existsSync(transcriptPath)) {
        const stat = fs.statSync(transcriptPath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestFile = transcriptPath;
        }
      }
    });

    return latestFile;
  } catch (err) {
    console.error('[Transcript Watcher] Error scanning brain directory:', err);
    return null;
  }
}

let activeTranscriptFile = null;
let currentFileSize = 0;
let fileWatcherInterval = null;
let lineRemainder = '';

// Keeps track of the last broadcasted state to prevent spamming the client
let lastBroadcastedEvent = null;

function parseStepAndBroadcast(step) {
  const timestamp = step.created_at || new Date().toISOString();

  // 1. User sends a new request
  if (step.source === 'USER_EXPLICIT' && step.type === 'USER_INPUT') {
    broadcastTelemetry({
      timestamp,
      event: 'planning',
      message: `User Request Received:\n${step.content}`,
      metadata: { context_pct: 0 }
    });
    lastBroadcastedEvent = 'planning';
    return;
  }

  // 2. AI thinking/reasoning blocks
  let hasThinking = false;
  if (step.thinking && step.thinking.trim()) {
    broadcastTelemetry({
      timestamp,
      event: 'thinking',
      message: step.thinking.trim(),
      metadata: {}
    });
    lastBroadcastedEvent = 'thinking';
    hasThinking = true;
  }

  // 3. AI executing tool calls
  if (step.tool_calls && step.tool_calls.length > 0) {
    const broadcastTools = () => {
      step.tool_calls.forEach(toolCall => {
        const toolName = toolCall.name;
        let target = '';
        let msg = '';

        if (toolCall.name === 'run_command' && toolCall.args) {
          target = toolCall.args.CommandLine || '';
          msg = `Executing terminal command: ${target}`;
        } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content'].includes(toolCall.name) && toolCall.args) {
          target = toolCall.args.TargetFile || '';
          msg = `Writing changes to file: ${path.basename(target)}`;
        } else if (toolCall.name === 'view_file' && toolCall.args) {
          target = toolCall.args.AbsolutePath || '';
          msg = `Reading file: ${path.basename(target)}`;
        } else if (toolCall.name === 'list_dir' && toolCall.args) {
          target = toolCall.args.DirectoryPath || '';
          msg = `Listing files in directory: ${path.basename(target)}`;
        } else if (toolCall.name === 'grep_search' && toolCall.args) {
          const query = toolCall.args.Query || '';
          target = toolCall.args.SearchPath || '';
          msg = `Searching pattern "${query}" in: ${path.basename(target)}`;
        } else if (toolCall.name === 'search_web' && toolCall.args) {
          target = toolCall.args.query || '';
          msg = `Searching the web for: "${target}"`;
        } else if (toolCall.name === 'read_url_content' && toolCall.args) {
          target = toolCall.args.Url || '';
          msg = `Fetching web content from URL: ${target}`;
        } else if (toolCall.name === 'invoke_subagent' && toolCall.args) {
          const subagents = toolCall.args.Subagents || [];
          const roles = subagents.map(s => s.Role).join(', ');
          target = roles;
          msg = `Invoking subagents: ${roles}`;
        } else if (toolCall.name === 'send_message' && toolCall.args) {
          target = toolCall.args.Recipient || '';
          msg = `Sending message to subagent: ${target}`;
        } else {
          msg = `Invoking workspace tool: ${toolName}`;
        }

        broadcastTelemetry({
          timestamp,
          event: 'executing_tool',
          message: msg,
          metadata: {
            tool_name: toolName,
            target: target || undefined
          }
        });
        lastBroadcastedEvent = 'executing_tool';
      });
    };

    if (hasThinking) {
      setTimeout(broadcastTools, 1500);
    } else {
      broadcastTools();
    }
  }

  // 4. Command outputs & execution logs
  if (step.source === 'MODEL' && step.status === 'DONE' && step.content) {
    // Only broadcast command outputs, file write completions, etc.
    const isToolOutput = [
      'RUN_COMMAND', 
      'CODE_ACTION', 
      'VIEW_FILE', 
      'LIST_DIRECTORY', 
      'GREP_SEARCH', 
      'SEARCH_WEB', 
      'READ_URL_CONTENT', 
      'INVOKE_SUBAGENT'
    ].includes(step.type);
    
    if (isToolOutput) {
      broadcastTelemetry({
        timestamp,
        event: 'executing_tool',
        message: step.content.trim(),
        metadata: {
          tool_name: step.type.toLowerCase(),
          target: step.exit_code !== undefined ? `Exit Code: ${step.exit_code}` : undefined
        }
      });
      lastBroadcastedEvent = 'executing_tool';
    }
  }

  // 5. Check if execution errored
  if (step.status === 'ERROR') {
    broadcastTelemetry({
      timestamp,
      event: 'task_error',
      message: `Execution Error: ${step.content || 'Tool invocation aborted.'}`,
      metadata: {}
    });
    lastBroadcastedEvent = 'task_error';
    return;
  }

  // 6. Turn completion: If the MODEL completes its response, and it has no pending tool calls, it means the agent finished the task turn!
  if (step.source === 'MODEL' && step.type === 'PLANNER_RESPONSE' && step.status === 'DONE') {
    const hasToolCalls = step.tool_calls && step.tool_calls.length > 0;
    if (!hasToolCalls && lastBroadcastedEvent !== 'task_done') {
      broadcastTelemetry({
        timestamp,
        event: 'task_done',
        message: 'Task turn finished. Awaiting next request...',
        metadata: { elapsed_seconds: 0, tokens_per_sec: 45 }
      });
      lastBroadcastedEvent = 'task_done';
    }
  }
}

function processChunk(data) {
  const text = lineRemainder + data;
  const lines = text.split(/\r?\n/);
  lineRemainder = lines.pop(); // save incomplete line

  lines.forEach(line => {
    if (!line.trim()) return;
    try {
      const step = JSON.parse(line);
      parseStepAndBroadcast(step);
    } catch (e) {
      // JSON parse errors are ignored for half-written lines
    }
  });
}

function startWatchingTranscript() {
  activeTranscriptFile = getLatestTranscriptPath();
  if (activeTranscriptFile) {
    try {
      const stat = fs.statSync(activeTranscriptFile);
      currentFileSize = stat.size; // start watching from current position to avoid spamming historical logs
      console.log(`[Watcher] Initialized tracking on active transcript: ${activeTranscriptFile} (Size: ${currentFileSize} bytes)`);
    } catch (err) {
      console.error('[Watcher] Failed to stat transcript file:', err);
    }
  } else {
    console.log('[Watcher] Scanning... Waiting for active conversation transcript log file.');
  }

  if (fileWatcherInterval) clearInterval(fileWatcherInterval);

  fileWatcherInterval = setInterval(() => {
    try {
      const currentLatest = getLatestTranscriptPath();
      if (!currentLatest) return;

      // Handle conversation transition
      if (currentLatest !== activeTranscriptFile) {
        console.log(`[Watcher] Switched to new active conversation: ${currentLatest}`);
        activeTranscriptFile = currentLatest;
        currentFileSize = 0;
        lineRemainder = '';
      }

      if (!fs.existsSync(activeTranscriptFile)) return;

      const stat = fs.statSync(activeTranscriptFile);
      if (stat.size > currentFileSize) {
        const stream = fs.createReadStream(activeTranscriptFile, {
          start: currentFileSize,
          end: stat.size - 1
        });

        let chunk = '';
        stream.on('data', data => { chunk += data.toString(); });
        stream.on('end', () => {
          currentFileSize = stat.size;
          processChunk(chunk);
        });
      } else if (stat.size < currentFileSize) {
        // File truncated/reset
        currentFileSize = stat.size;
      }
    } catch (err) {
      console.error('[Watcher] Error checking file updates:', err);
    }
  }, 250);
}

// Start listening
server.listen(port, () => {
  console.log(`[Server] OrchestrateLive Bridge Server listening at http://localhost:${port}`);
  // Start the workspace transcript watcher
  startWatchingTranscript();
});
