const express = require('express');
const http = require('http');
const ws = require('ws');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

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

// Serve showcase presentation website from Frontend folder
app.use('/frontend', express.static(path.join(__dirname, '../Frontend'), {
  etag: false,
  maxAge: 0
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
  let stepCacheReadTokens = 0;
  let stepOutTokens = 0;

  const usageObj = step.usage || (step.message && step.message.usage) || (step.metadata && step.metadata.usage);
  if (usageObj && (typeof usageObj.input_tokens === 'number' || typeof usageObj.prompt_tokens === 'number')) {
    isStepExact = true;
    runState.hasExactUsageData = true;
    stepInTokens = usageObj.input_tokens || usageObj.prompt_tokens || 0;
    stepCacheReadTokens = usageObj.cache_read_input_tokens || 0;
    stepOutTokens = usageObj.output_tokens || usageObj.completion_tokens || 0;

    runState.sessionExactInputTokens += stepInTokens;
    runState.sessionExactCacheReadTokens = (runState.sessionExactCacheReadTokens || 0) + stepCacheReadTokens;
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
  if (typeof step.tokens_per_sec === 'number' && step.tokens_per_sec > 0) {
    runState.lastCalculatedSpeed = Math.round(step.tokens_per_sec);
  } else if (runState.lastStepTimestamp) {
    const elapsedSec = Math.max(0.4, (now - runState.lastStepTimestamp) / 1000);
    const stepTokens = isStepExact ? (stepInTokens + stepCacheReadTokens + stepOutTokens) : Math.max(10, Math.round(((step.content || '').length + (step.thinking || '').length) / 4));
    if (elapsedSec < 30) {
      runState.lastCalculatedSpeed = Math.min(180, Math.max(15, Math.round(stepTokens / elapsedSec)));
    }
  }
  runState.lastStepTimestamp = now;

  const totalInTokens = runState.hasExactUsageData ? runState.sessionExactInputTokens : Math.round(runState.sessionInputChars / 4);
  const totalCacheReadTokens = runState.hasExactUsageData ? (runState.sessionExactCacheReadTokens || 0) : 0;
  const totalOutTokens = runState.hasExactUsageData ? runState.sessionExactOutputTokens : Math.round(runState.sessionOutputChars / 4);
  const totalTokens = totalInTokens + totalCacheReadTokens + totalOutTokens;

  const isClaude = runId.startsWith('claude') || (runState.run_name && runState.run_name.toLowerCase().includes('claude'));
  const isKilo = runId.startsWith('kilo') || (runState.run_name && runState.run_name.toLowerCase().includes('kilo'));
  const maxContextWindow = (isClaude || isKilo) ? 200000 : 1000000;
  const contextPct = Math.min(100, Math.max(0.1, Math.round((totalTokens / maxContextWindow) * 100 * 10) / 10));

  return {
    is_exact: runState.hasExactUsageData,
    tokens_per_sec: runState.lastCalculatedSpeed,
    context_pct: contextPct,
    input_tokens: runState.hasExactUsageData ? runState.sessionExactInputTokens : null,
    output_tokens: runState.hasExactUsageData ? runState.sessionExactOutputTokens : null,
    cache_read_tokens: runState.hasExactUsageData ? (runState.sessionExactCacheReadTokens || 0) : null
  };
}

// Broadcast to all active WebSocket clients
function broadcastTelemetry(telemetryData) {
  if (telemetryData.run_id && runsState[telemetryData.run_id]) {
    const r = runsState[telemetryData.run_id];
    r.recentEvents = r.recentEvents || [];
    r.recentEvents.push(telemetryData);
    if (r.recentEvents.length > 150) r.recentEvents.shift();
    if (telemetryData.metadata) r.lastMetrics = telemetryData.metadata;
    if (telemetryData.event) r.lastEvent = telemetryData.event;
  }

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

// REST POST endpoint to reset all active runs state
app.post('/api/runs/reset', (req, res) => {
  Object.keys(runsState).forEach(key => delete runsState[key]);
  Object.keys(watchedTranscripts).forEach(key => delete watchedTranscripts[key]);
  Object.keys(watchedKiloSessions).forEach(key => delete watchedKiloSessions[key]);
  lastKiloDbMtime = 0;
  runColorIdx = 0;
  
  // Broadcast reset notification to all connected clients
  wss.clients.forEach((client) => {
    if (client.readyState === ws.OPEN) {
      client.send(JSON.stringify({ type: 'reset_all' }));
    }
  });

  return res.status(200).json({ status: 'ok', message: 'All telemetry data reset successfully.' });
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

function getClaudeProjectsDir() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const claudePath = path.join(homeDir, '.claude/projects');
  if (fs.existsSync(claudePath)) return claudePath;
  return null;
}

function getKiloDbPath() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const candidatePaths = [
    path.join(homeDir, '.local', 'share', 'kilo', 'kilo.db'),
    path.join(process.env.LOCALAPPDATA || '', 'kilo', 'kilo.db'),
    path.join(process.env.APPDATA || '', 'kilo', 'kilo.db'),
    path.join(homeDir, '.kilo', 'kilo.db'),
    path.join(homeDir, '.config', 'kilo', 'kilo.db')
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// Track watched files and line remainders per transcript path
const watchedTranscripts = {};
let fileWatcherInterval = null;

function detectCliToolName(filePathOrDir) {
  const lower = (filePathOrDir || '').toLowerCase();
  if (lower.includes('antigravity')) return 'Antigravity CLI';
  if (lower.includes('claude')) return 'Claude Code';
  if (lower.includes('kilo')) return 'Kilo CLI';
  if (lower.includes('cursor')) return 'Cursor CLI';
  if (lower.includes('stitch')) return 'Stitch MCP Worker';
  return 'AI CLI';
}

function watchFileAndUpdate(transcriptPath, runId, runName, isClaude, stat) {
  if (!watchedTranscripts[transcriptPath]) {
    try {
      watchedTranscripts[transcriptPath] = {
        run_id: runId,
        run_name: runName,
        isClaude: isClaude,
        currentFileSize: stat.size,
        lineRemainder: ''
      };
      console.log(`[MultiWatcher] Registered active transcript watcher for [${runName}]: ${transcriptPath} (${stat.size} bytes)`);
    } catch (err) {
      console.error('[MultiWatcher] Error statting file:', err);
      return;
    }
  }

  const watched = watchedTranscripts[transcriptPath];
  try {
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
}

function scanAndProcessTranscripts() {
  const activeWindow = Date.now() - (30 * 60 * 1000); // 30 minutes active window
  const candidateTranscripts = [];

  // Auto-prune inactive runs from runsState if no activity in activeWindow
  const cutoffTime = Date.now() - (30 * 60 * 1000);
  Object.keys(runsState).forEach(id => {
    if (runsState[id].lastActivityTime && runsState[id].lastActivityTime < cutoffTime) {
      delete runsState[id];
    }
  });

  // 1. Scan Antigravity CLI Brain Directory
  const brainDir = getBrainDir();
  if (brainDir) {
    try {
      const folders = fs.readdirSync(brainDir);
      const cliBrand = detectCliToolName(brainDir);

      folders.forEach(folder => {
        const transcriptPath = path.join(brainDir, folder, '.system_generated/logs/transcript.jsonl');
        if (!fs.existsSync(transcriptPath)) return;

        const stat = fs.statSync(transcriptPath);
        if (stat.mtimeMs < activeWindow) return;

        const runId = `conv-${folder}`;
        let shortFolder = folder.length > 12 ? folder.substring(0, 8) : folder;
        const runName = `${cliBrand} (${shortFolder})`;

        candidateTranscripts.push({ transcriptPath, runId, runName, isClaude: false, stat });
      });
    } catch (err) {
      console.error('[MultiWatcher] Error scanning brain directory:', err);
    }
  }

  // 2. Scan Claude Code CLI Projects Directory (~/.claude/projects/*/*.jsonl)
  const claudeProjectsDir = getClaudeProjectsDir();
  if (claudeProjectsDir) {
    try {
      const projFolders = fs.readdirSync(claudeProjectsDir);
      projFolders.forEach(projFolder => {
        const fullProjPath = path.join(claudeProjectsDir, projFolder);
        try {
          if (!fs.statSync(fullProjPath).isDirectory()) return;

          const files = fs.readdirSync(fullProjPath);
          files.forEach(file => {
            if (!file.endsWith('.jsonl')) return;

            const transcriptPath = path.join(fullProjPath, file);
            const stat = fs.statSync(transcriptPath);
            if (stat.mtimeMs < activeWindow) return;

            const sessionId = file.replace('.jsonl', '');
            const shortId = sessionId.length > 8 ? sessionId.substring(0, 8) : sessionId;
            const runId = `claude-${shortId}`;
            const runName = `Claude Code (${shortId})`;

            candidateTranscripts.push({ transcriptPath, runId, runName, isClaude: true, stat });
          });
        } catch (e) {
          // Ignore subfolder read errors
        }
      });
    } catch (err) {
      console.error('[MultiWatcher] Error scanning Claude Code projects directory:', err);
    }
  }

  // Process all candidate transcripts within the active time window
  candidateTranscripts.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  candidateTranscripts.forEach(item => {
    watchFileAndUpdate(item.transcriptPath, item.runId, item.runName, item.isClaude, item.stat);
  });

  // 3. Scan Kilo CLI SQLite Database (~/.local/share/kilo/kilo.db)
  scanAndProcessKiloTranscripts(activeWindow);
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
          let subagents = toolCall.args.Subagents || [];
          if (typeof subagents === 'string') { try { subagents = JSON.parse(subagents); } catch (e) { subagents = []; } }
          const roles = Array.isArray(subagents) ? subagents.map(s => s.Role).join(', ') : String(subagents);
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

// Claude Code JSONL Step Parser & Telemetry Dispatcher
function parseClaudeStepAndBroadcast(step, runId, runName) {
  const timestamp = step.timestamp || new Date().toISOString();
  const runState = getOrCreateRunState(runId, runName);

  // 1. User request message
  if (step.type === 'user' && step.message) {
    let userMsg = '';
    if (typeof step.message.content === 'string') {
      userMsg = step.message.content;
    } else if (Array.isArray(step.message.content)) {
      userMsg = step.message.content.map(b => b.text || b.content || '').join('\n');
    }

    if (userMsg && !userMsg.includes('<local-command-caveat>') && !userMsg.includes('# Fewer Permission Prompts')) {
      const cleanMsg = userMsg.replace(/<command-name>(.*?)<\/command-name>/gi, '$1')
                               .replace(/<command-message>.*?<\/command-message>/gi, '')
                               .replace(/<command-args>.*?<\/command-args>/gi, '')
                               .replace(/<.*?>/g, '')
                               .trim();
      if (cleanMsg) {
        const liveMetrics = computeLiveMetricsForRun(runId, { content: cleanMsg, created_at: timestamp });
        broadcastTelemetry({
          run_id: runId,
          run_name: runState.run_name,
          run_color: runState.color,
          timestamp,
          event: 'planning',
          message: `User Request Received:\n${cleanMsg}`,
          metadata: { ...liveMetrics }
        });
        runState.lastBroadcastedEvent = 'planning';
      }
    }
    return;
  }

  // 2. Assistant turn with content array (thinking, text, tool_use)
  if (step.type === 'assistant' && step.message) {
    const liveMetrics = computeLiveMetricsForRun(runId, {
      usage: step.message.usage,
      created_at: timestamp
    });

    const content = step.message.content;
    if (Array.isArray(content)) {
      content.forEach(block => {
        if (block.type === 'thinking' && block.thinking && block.thinking.trim()) {
          broadcastTelemetry({
            run_id: runId,
            run_name: runState.run_name,
            run_color: runState.color,
            timestamp,
            event: 'thinking',
            message: block.thinking.trim(),
            metadata: { ...liveMetrics }
          });
          runState.lastBroadcastedEvent = 'thinking';
        } else if (block.type === 'tool_use') {
          const toolName = block.name || 'tool';
          const input = block.input || {};
          let mappedTool = 'run_command';
          let target = '';
          let msg = '';

          if (toolName === 'Bash') {
            mappedTool = 'run_command';
            target = input.command || '';
            msg = `Executing terminal command: ${target}`;
          } else if (['Read', 'View'].includes(toolName)) {
            mappedTool = 'view_file';
            target = input.file_path || input.path || '';
            msg = `Reading file: ${path.basename(target)}`;
          } else if (['Edit', 'Write', 'MultiEdit'].includes(toolName)) {
            mappedTool = 'replace_file_content';
            target = input.file_path || input.path || '';
            msg = `Writing changes to file: ${path.basename(target)}`;
          } else if (['Glob', 'Grep'].includes(toolName)) {
            mappedTool = 'grep_search';
            target = input.pattern || input.path || '';
            msg = `Searching codebase: ${target}`;
          } else if (['WebFetch', 'WebSearch'].includes(toolName)) {
            mappedTool = 'search_web';
            target = input.url || input.query || '';
            msg = `Fetching web content: ${target}`;
          } else if (toolName === 'Agent') {
            mappedTool = 'invoke_subagent';
            target = input.subagent_type || input.prompt || 'Agent';
            msg = `Invoking subagent: ${target}`;
          } else {
            mappedTool = toolName.toLowerCase();
            msg = `Invoking tool: ${toolName}`;
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
              tool_name: mappedTool,
              target: target || undefined
            }
          });
          runState.lastBroadcastedEvent = 'executing_tool';
        }
      });
    }

    if (step.error || step.isApiErrorMessage) {
      broadcastTelemetry({
        run_id: runId,
        run_name: runState.run_name,
        run_color: runState.color,
        timestamp,
        event: 'task_error',
        message: `Claude Code Error: ${step.error || 'Request failed.'}`,
        metadata: { ...liveMetrics }
      });
      runState.lastBroadcastedEvent = 'task_error';
    }
    return;
  }

  // 3. System turn completion
  if (step.type === 'system' && step.subtype === 'turn_duration') {
    const liveMetrics = computeLiveMetricsForRun(runId, { created_at: timestamp });
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

// --- KILO CLI SQLITE & LOG PARSER ---
const watchedKiloSessions = {};
let isKiloScanning = false;

function parseKiloPartAndBroadcast(row, runId, runName) {
  let pData = {};
  let mData = {};
  try {
    pData = typeof row.part_data === 'string' ? JSON.parse(row.part_data) : (row.part_data || {});
  } catch (e) { pData = {}; }
  try {
    mData = typeof row.message_data === 'string' ? JSON.parse(row.message_data) : (row.message_data || {});
  } catch (e) { mData = {}; }

  const timestamp = row.time_created ? new Date(row.time_created).toISOString() : new Date().toISOString();
  const runState = getOrCreateRunState(runId, runName);

  // 1. User Message (role === 'user' and type === 'text')
  if (mData.role === 'user' && pData.type === 'text' && pData.text && pData.text.trim()) {
    const userText = pData.text.trim();
    const liveMetrics = computeLiveMetricsForRun(runId, { content: userText, created_at: timestamp });
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'planning',
      message: `User Request Received:\n${userText}`,
      metadata: { ...liveMetrics }
    });
    runState.lastBroadcastedEvent = 'planning';
    return;
  }

  // 2. Assistant Thinking (type === 'reasoning')
  if (pData.type === 'reasoning' && pData.text && pData.text.trim()) {
    const liveMetrics = computeLiveMetricsForRun(runId, { thinking: pData.text, created_at: timestamp });
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'thinking',
      message: pData.text.trim(),
      metadata: { ...liveMetrics }
    });
    runState.lastBroadcastedEvent = 'thinking';
    return;
  }

  // 3. Assistant Tool Execution (type === 'tool')
  if (pData.type === 'tool') {
    const toolName = pData.tool || 'tool';
    const state = pData.state || {};
    const input = state.input || {};
    let mappedTool = 'run_command';
    let target = '';
    let msg = '';

    if (toolName === 'bash') {
      mappedTool = 'run_command';
      target = input.command || '';
      msg = `Executing terminal command: ${target}`;
    } else if (['read', 'view'].includes(toolName.toLowerCase())) {
      mappedTool = 'view_file';
      target = input.filePath || input.path || input.file || '';
      msg = `Reading file: ${path.basename(target)}`;
    } else if (['write', 'edit', 'multiedit'].includes(toolName.toLowerCase())) {
      mappedTool = 'replace_file_content';
      target = input.filePath || input.path || input.file || '';
      msg = `Writing changes to file: ${path.basename(target)}`;
    } else if (['grep', 'find', 'glob'].includes(toolName.toLowerCase())) {
      mappedTool = 'grep_search';
      target = input.pattern || input.path || input.query || '';
      msg = `Searching codebase for: ${target}`;
    } else if (['todowrite', 'todoread'].includes(toolName.toLowerCase())) {
      mappedTool = 'mcp';
      target = state.title || 'Workspace Tasks';
      msg = `Updating workspace task list: ${target}`;
    } else {
      mappedTool = toolName.toLowerCase();
      target = state.title || '';
      msg = `Invoking tool: ${toolName}`;
    }

    const liveMetrics = computeLiveMetricsForRun(runId, { created_at: timestamp });
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'executing_tool',
      message: msg,
      metadata: {
        ...liveMetrics,
        tool_name: mappedTool,
        target: target || undefined
      }
    });
    runState.lastBroadcastedEvent = 'executing_tool';

    // Tool error / failure check
    if (state.status === 'error' || state.error) {
      broadcastTelemetry({
        run_id: runId,
        run_name: runState.run_name,
        run_color: runState.color,
        timestamp,
        event: 'task_error',
        message: `Kilo Tool Error: ${state.error || state.output || 'Invocation failed'}`,
        metadata: { ...liveMetrics }
      });
      runState.lastBroadcastedEvent = 'task_error';
    }
    return;
  }

  // 4. Step Finish (type === 'step-finish')
  if (pData.type === 'step-finish') {
    const tokens = pData.tokens || pData.usage || {};
    const metrics = pData.metrics || {};
    const cost = pData.cost !== undefined ? pData.cost : row.cost;

    const inputTokens = tokens.input !== undefined ? tokens.input : (tokens.input_tokens || tokens.prompt_tokens || 0);
    const outputTokens = tokens.output !== undefined ? tokens.output : (tokens.output_tokens || tokens.completion_tokens || 0);
    const cacheReadTokens = tokens.cache ? (tokens.cache.read || 0) : (tokens.cache_read_input_tokens || 0);

    const liveMetrics = computeLiveMetricsForRun(runId, {
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheReadTokens
      },
      tokens_per_sec: metrics.generation ? Math.round(metrics.generation) : undefined,
      cost: cost,
      created_at: timestamp
    });

    const isStop = pData.reason === 'stop';
    const eventType = isStop ? 'task_done' : (runState.lastBroadcastedEvent || 'thinking');
    const msg = isStop ? 'Task turn finished. Awaiting next request...' : `Step completed: ${inputTokens + outputTokens} tokens processed`;

    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: eventType,
      message: msg,
      metadata: { ...liveMetrics }
    });
    if (isStop) runState.lastBroadcastedEvent = 'task_done';
    return;
  }

  // 5. Assistant Output Text (role === 'assistant' and type === 'text')
  if (mData.role === 'assistant' && pData.type === 'text' && pData.text && pData.text.trim()) {
    const text = pData.text.trim();
    const liveMetrics = computeLiveMetricsForRun(runId, { content: text, created_at: timestamp });
    broadcastTelemetry({
      run_id: runId,
      run_name: runState.run_name,
      run_color: runState.color,
      timestamp,
      event: 'thinking',
      message: `Assistant Response:\n${text}`,
      metadata: { ...liveMetrics }
    });
    runState.lastBroadcastedEvent = 'thinking';
    return;
  }
}

let lastKiloDbMtime = 0;

function scanAndProcessKiloTranscripts(activeWindow) {
  const dbPath = getKiloDbPath();
  if (!dbPath || isKiloScanning) return;

  try {
    const stat = fs.statSync(dbPath);
    if (stat.mtimeMs < activeWindow) return;
    if (lastKiloDbMtime && stat.mtimeMs <= lastKiloDbMtime) return;
    lastKiloDbMtime = stat.mtimeMs;
  } catch (e) {
    return;
  }

  isKiloScanning = true;

  // Query recent sessions from kilo.db
  const sessionsQuery = `SELECT id, title, slug, directory, time_created, time_updated, cost, tokens_input, tokens_output, model FROM session ORDER BY time_updated DESC LIMIT 10;`;

  try {
    execFile('sqlite3', ['-json', dbPath, sessionsQuery], (err, stdout) => {
      if (err) {
        isKiloScanning = false;
        return;
      }

      let sessions = [];
      try {
        sessions = JSON.parse(stdout || '[]');
      } catch (e) {
        isKiloScanning = false;
        return;
      }

      if (!Array.isArray(sessions) || sessions.length === 0) {
        isKiloScanning = false;
        return;
      }

      const activeSessions = sessions.filter(session => {
        const updatedTime = session.time_updated ? new Date(session.time_updated).getTime() : (session.time_created ? new Date(session.time_created).getTime() : 0);
        return updatedTime >= activeWindow;
      });

      if (activeSessions.length === 0) {
        isKiloScanning = false;
        return;
      }

      let pending = activeSessions.length;

      activeSessions.forEach(session => {
        const sessionId = session.id;
        const shortId = sessionId.length > 8 ? sessionId.substring(sessionId.length - 8) : sessionId;
        const runId = `kilo-${shortId}`;
        const shortTitle = session.title ? (session.title.length > 22 ? session.title.substring(0, 20) + '...' : session.title) : (session.slug || shortId);
        const runName = `Kilo CLI (${shortTitle})`;

        let isInitial = false;
        if (!watchedKiloSessions[sessionId]) {
          isInitial = true;
          watchedKiloSessions[sessionId] = {
            run_id: runId,
            run_name: runName,
            lastRowId: 0
          };
          console.log(`[MultiWatcher] Registered active Kilo CLI watcher for [${runName}]: session ${sessionId}`);
        }

        const watched = watchedKiloSessions[sessionId];
        const partsQuery = `
          SELECT 
            p.rowid as row_id,
            p.id as part_id,
            p.session_id,
            p.message_id,
            p.time_created,
            p.data as part_data,
            m.data as message_data
          FROM part p
          JOIN message m ON p.message_id = m.id
          WHERE p.session_id = '${sessionId}' AND p.rowid > ${watched.lastRowId}
          ORDER BY p.rowid ASC;
        `;

        try {
          execFile('sqlite3', ['-json', dbPath, partsQuery], (pErr, pStdout) => {
            pending--;
            if (!pErr && pStdout) {
              try {
                const parts = JSON.parse(pStdout || '[]');
                if (Array.isArray(parts) && parts.length > 0) {
                  parts.forEach(r => {
                    watched.lastRowId = Math.max(watched.lastRowId, r.row_id);
                    if (!isInitial) {
                      parseKiloPartAndBroadcast(r, runId, runName);
                    }
                  });
                }
              } catch (e) {}
            }
            if (pending <= 0) {
              isKiloScanning = false;
            }
          });
        } catch (spawnErr) {
          pending--;
          if (pending <= 0) {
            isKiloScanning = false;
          }
        }
      });
    });
  } catch (outerErr) {
    isKiloScanning = false;
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
      if (watchedObj.isClaude) {
        parseClaudeStepAndBroadcast(step, runId, runName);
      } else {
        parseStepAndBroadcastMulti(step, runId, runName);
      }
    } catch (e) {
      // JSON parse errors ignored for partial lines
    }
  });
}

function startMultiTranscriptWatcher() {
  scanAndProcessTranscripts();
  if (fileWatcherInterval) clearInterval(fileWatcherInterval);
  fileWatcherInterval = setInterval(scanAndProcessTranscripts, 1000);
}

// Start listening
server.listen(port, () => {
  console.log(`[Server] OrchestrateLive Bridge Server listening at http://localhost:${port}`);
  startMultiTranscriptWatcher();
});
