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
  
  // Send initial state of active runs to newly connected client
  wsClient.send(JSON.stringify({
    type: 'init_runs',
    runs: Object.values(runsState)
  }));

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

// Color Palette for Multi-Run Visual Badges
const RUN_COLORS = [
  '#00f5ff', // Cyan
  '#a855f7', // Electric Violet
  '#10b981', // Emerald Teal
  '#f59e0b', // Amber
  '#ec4899', // Hot Pink
  '#3b82f6'  // Sapphire Blue
];
let runColorIdx = 0;

// Multi-Run Telemetry State Store
const runsState = {};

function getOrCreateRunState(runId, runNameHint) {
  if (!runId) runId = 'cli-main';

  if (!runsState[runId]) {
    const color = RUN_COLORS[runColorIdx % RUN_COLORS.length];
    runColorIdx++;

    let displayName = runNameHint || runId;
    if (displayName.length > 22 && /^[a-f0-9-]+$/i.test(displayName)) {
      displayName = `CLI (${displayName.substring(0, 8)})`;
    }

    runsState[runId] = {
      run_id: runId,
      run_name: displayName,
      color: color,
      sessionInputChars: 0,
      sessionOutputChars: 0,
      sessionExactInputTokens: 0,
      sessionExactOutputTokens: 0,
      hasExactUsageData: false,
      lastStepTimestamp: null,
      lastCalculatedSpeed: 45,
      lastBroadcastedEvent: null,
      lastActivityTime: Date.now()
    };
  } else if (runNameHint && runsState[runId].run_name !== runNameHint) {
    runsState[runId].run_name = runNameHint;
  }

  runsState[runId].lastActivityTime = Date.now();
  return runsState[runId];
}

// Compute metrics per run
function computeLiveMetricsForRun(runId, step) {
  const runState = getOrCreateRunState(runId);
  let isStepExact = false;
  let stepInTokens = 0;
  let stepOutTokens = 0;

  const usageObj = step.usage || (step.message && step.message.usage) || (step.metadata && step.metadata.usage);
  if (usageObj && (typeof usageObj.input_tokens === 'number' || typeof usageObj.prompt_tokens === 'number')) {
    isStepExact = true;
    runState.hasExactUsageData = true;
    stepInTokens = usageObj.input_tokens || usageObj.prompt_tokens || 0;
    stepOutTokens = usageObj.output_tokens || usageObj.completion_tokens || 0;
    runState.sessionExactInputTokens += stepInTokens;
    runState.sessionExactOutputTokens += stepOutTokens;
  } else {
    const contentChars = (step.content || '').length;
    const thinkingChars = (step.thinking || '').length;
    const toolCallsChars = JSON.stringify(step.tool_calls || '').length;

    if (step.source === 'USER_EXPLICIT' || ['RUN_COMMAND', 'VIEW_FILE', 'LIST_DIRECTORY', 'GREP_SEARCH', 'SEARCH_WEB', 'READ_URL_CONTENT'].includes(step.type)) {
      runState.sessionInputChars += contentChars;
    } else {
      runState.sessionOutputChars += contentChars + thinkingChars + toolCallsChars;
    }
  }

  const now = step.created_at ? new Date(step.created_at).getTime() : Date.now();
  if (runState.lastStepTimestamp) {
    const elapsedSec = Math.max(0.4, (now - runState.lastStepTimestamp) / 1000);
    const stepTokens = isStepExact ? (stepInTokens + stepOutTokens) : Math.max(10, Math.round(((step.content || '').length + (step.thinking || '').length) / 4));
    if (elapsedSec < 30) {
      runState.lastCalculatedSpeed = Math.min(180, Math.max(15, Math.round(stepTokens / elapsedSec)));
    }
  }
  runState.lastStepTimestamp = now;

  const totalInTokens = runState.hasExactUsageData ? runState.sessionExactInputTokens : Math.round(runState.sessionInputChars / 4);
  const totalOutTokens = runState.hasExactUsageData ? runState.sessionExactOutputTokens : Math.round(runState.sessionOutputChars / 4);
  const totalTokens = totalInTokens + totalOutTokens;
  const contextPct = Math.min(100, Math.max(0.1, Math.round((totalTokens / 1000000) * 100 * 10) / 10));

  const cost = (totalInTokens / 1000000) * 0.15 + (totalOutTokens / 1000000) * 0.60;
  const estimatedCost = `${runState.hasExactUsageData ? '$' : '~$ '}${cost.toFixed(4)}`;

  return {
    is_exact: runState.hasExactUsageData,
    tokens_per_sec: runState.lastCalculatedSpeed,
    context_pct: contextPct,
    estimated_cost: estimatedCost
  };
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

// REST GET endpoint for active runs list
app.get('/api/runs', (req, res) => {
  return res.status(200).json({ runs: Object.values(runsState) });
});

// POST endpoint for Telemetry Logs (Supports Multi-Run)
app.post('/api/telemetry', (req, res) => {
  const { event, message, timestamp, metadata, run_id, run_name } = req.body;

  if (!event || !message) {
    return res.status(400).json({ error: 'Missing required fields: event and message are required.' });
  }

  if (!isValidEvent(event)) {
    return res.status(400).json({ error: `Invalid event type: "${event}".` });
  }

  const effectiveRunId = run_id || (metadata && metadata.run_id) || 'cli-main';
  const effectiveRunName = run_name || (metadata && metadata.run_name) || (effectiveRunId === 'cli-main' ? 'CLI 1 - Main' : effectiveRunId);
  const runState = getOrCreateRunState(effectiveRunId, effectiveRunName);

  // Compute live metrics if metadata is provided or step payload
  let computedMetadata = metadata || {};
  if (!computedMetadata.tokens_per_sec || !computedMetadata.context_pct) {
    const liveMetrics = computeLiveMetricsForRun(effectiveRunId, {
      content: message,
      created_at: timestamp
    });
    computedMetadata = { ...computedMetadata, ...liveMetrics };
  }

  runState.lastBroadcastedEvent = event;

  const telemetryData = {
    run_id: effectiveRunId,
    run_name: runState.run_name,
    run_color: runState.color,
    timestamp: timestamp || new Date().toISOString(),
    event,
    message,
    metadata: computedMetadata
  };

  const clientsNotified = broadcastTelemetry(telemetryData);
  console.log(`[HTTP Telemetry] Broadcast [${runState.run_name}] event "${event}" to ${clientsNotified} client(s): "${message.substring(0, 60)}"`);
  return res.status(200).json({ status: 'success', run_id: effectiveRunId, clientsNotified });
});

// --- TRANSCRIPT LOG WATCHER ENGINE (MULTI-RUN SUPPORT) ---

function getBrainDir() {
  const customPath = 'C:\\Users\\rakes\\.gemini\\antigravity-cli\\brain';
  if (fs.existsSync(customPath)) return customPath;

  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const fallbackPath = path.join(homeDir, '.gemini/antigravity-cli/brain');
  if (fs.existsSync(fallbackPath)) return fallbackPath;

  return null;
}

// Track watched files and line remainders per transcript path
const watchedTranscripts = {};
let fileWatcherInterval = null;

function scanAndProcessTranscripts() {
  const brainDir = getBrainDir();
  if (!brainDir) return;

  try {
    const folders = fs.readdirSync(brainDir);

    folders.forEach(folder => {
      const transcriptPath = path.join(brainDir, folder, '.system_generated/logs/transcript.jsonl');
      if (!fs.existsSync(transcriptPath)) return;

      const runId = `conv-${folder}`;
      let shortFolder = folder.length > 12 ? folder.substring(0, 8) : folder;
      const runName = `CLI (${shortFolder})`;

      if (!watchedTranscripts[transcriptPath]) {
        try {
          const stat = fs.statSync(transcriptPath);
          watchedTranscripts[transcriptPath] = {
            run_id: runId,
            run_name: runName,
            currentFileSize: stat.size,
            lineRemainder: ''
          };
          console.log(`[MultiWatcher] Registered transcript watcher for [${runName}]: ${transcriptPath} (${stat.size} bytes)`);
        } catch (err) {
          console.error('[MultiWatcher] Error statting file:', err);
        }
        return;
      }

      const watched = watchedTranscripts[transcriptPath];
      try {
        const stat = fs.statSync(transcriptPath);

        if (stat.size > watched.currentFileSize) {
          const stream = fs.createReadStream(transcriptPath, {
            start: watched.currentFileSize,
            end: stat.size - 1
          });

          let chunk = '';
          stream.on('data', data => { chunk += data.toString(); });
          stream.on('end', () => {
            watched.currentFileSize = stat.size;
            processTranscriptChunk(chunk, watched.run_id, watched.run_name, watched);
          });
        } else if (stat.size < watched.currentFileSize) {
          watched.currentFileSize = stat.size;
        }
      } catch (err) {
        console.error('[MultiWatcher] Error checking file updates:', err);
      }
    });
  } catch (err) {
    console.error('[MultiWatcher] Error scanning brain directory:', err);
  }
}

function parseStepAndBroadcastMulti(step, runId, runName) {
  const timestamp = step.created_at || new Date().toISOString();
  const liveMetrics = computeLiveMetricsForRun(runId, step);
  const runState = getOrCreateRunState(runId, runName);

  // 1. User sends a new request
  if (step.source === 'USER_EXPLICIT' && step.type === 'USER_INPUT') {
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'planning',
      message: `User Request Received:\n${step.content}`,
      metadata: { ...liveMetrics }
    });
    runState.lastBroadcastedEvent = 'planning';
    return;
  }

  // 2. AI thinking/reasoning blocks
  let hasThinking = false;
  if (step.thinking && step.thinking.trim()) {
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'thinking',
      message: step.thinking.trim(),
      metadata: { ...liveMetrics }
    });
    runState.lastBroadcastedEvent = 'thinking';
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
          run_id: runId,
          run_name: runState.run_name,
          run_color: runState.color,
          timestamp,
          event: 'executing_tool',
          message: msg,
          metadata: {
            ...liveMetrics,
            tool_name: toolName,
            target: target || undefined
          }
        });
        runState.lastBroadcastedEvent = 'executing_tool';
      });
    };

    if (hasThinking) {
      setTimeout(broadcastTools, 1200);
    } else {
      broadcastTools();
    }
  }

  // 4. Command outputs & execution logs
  if (step.source === 'MODEL' && step.status === 'DONE' && step.content) {
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
        run_id: runId,
        run_name: runState.run_name,
        run_color: runState.color,
        timestamp,
        event: 'executing_tool',
        message: step.content.trim(),
        metadata: {
          ...liveMetrics,
          tool_name: step.type.toLowerCase(),
          target: step.exit_code !== undefined ? `Exit Code: ${step.exit_code}` : undefined
        }
      });
      runState.lastBroadcastedEvent = 'executing_tool';
    }
  }

  // 5. Check if execution errored
  if (step.status === 'ERROR') {
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'task_error',
      message: `Execution Error: ${step.content || 'Tool invocation aborted.'}`,
      metadata: { ...liveMetrics }
    });
    runState.lastBroadcastedEvent = 'task_error';
    return;
  }

  // 6. Turn completion
  if (step.source === 'MODEL' && step.type === 'PLANNER_RESPONSE' && step.status === 'DONE') {
    const hasToolCalls = step.tool_calls && step.tool_calls.length > 0;
    if (!hasToolCalls && runState.lastBroadcastedEvent !== 'task_done') {
      broadcastTelemetry({
        run_id: runId,
        run_name: runState.run_name,
        run_color: runState.color,
        timestamp,
        event: 'task_done',
        message: 'Task turn finished. Awaiting next request...',
        metadata: { ...liveMetrics }
      });
      runState.lastBroadcastedEvent = 'task_done';
    }
  }
}

function processTranscriptChunk(data, runId, runName, watchedObj) {
  const text = watchedObj.lineRemainder + data;
  const lines = text.split(/\r?\n/);
  watchedObj.lineRemainder = lines.pop();

  lines.forEach(line => {
    if (!line.trim()) return;
    try {
      const step = JSON.parse(line);
      parseStepAndBroadcastMulti(step, runId, runName);
    } catch (e) {
      // JSON parse errors ignored for partial lines
    }
  });
}

function startMultiTranscriptWatcher() {
  scanAndProcessTranscripts();
  if (fileWatcherInterval) clearInterval(fileWatcherInterval);
  fileWatcherInterval = setInterval(scanAndProcessTranscripts, 250);
}

// Start listening
server.listen(port, () => {
  console.log(`[Server] OrchestrateLive Bridge Server listening at http://localhost:${port}`);
  startMultiTranscriptWatcher();
});
