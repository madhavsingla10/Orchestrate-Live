/**
 * Multi-Run Telemetry Simulation Script for OrchestrateLive
 * Simulates 2 parallel CLI agents sending live telemetry & metrics concurrently.
 */
const http = require('http');

function sendEvent(data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/telemetry',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      resolve();
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runMultiSim() {
  console.log('🚀 Starting OrchestrateLive Parallel Multi-Run Simulation...');

  // Step 1: CLI 1 & CLI 2 Start Reasoning
  console.log('-> Sending Parallel Thinking Events...');
  await sendEvent({
    run_id: 'cli-backend',
    run_name: 'Antigravity CLI (e53b43b2)',
    event: 'thinking',
    message: 'Analyzing Express bridge server and WebSocket streaming protocols for multi-run concurrency...',
    metadata: { context_pct: 18, tokens_per_sec: 52, is_exact: true }
  });

  await sendEvent({
    run_id: 'cli-mcp-worker',
    run_name: 'Claude Code (w2458a12)',
    event: 'thinking',
    message: 'Connecting to Stitch MCP server to retrieve project design schemas and UI variants...',
    metadata: { context_pct: 34, tokens_per_sec: 41, is_exact: true }
  });

  await sleep(1500);

  // Step 2: Planning Phase
  console.log('-> Sending Parallel Planning Events...');
  await sendEvent({
    run_id: 'cli-backend',
    run_name: 'Antigravity CLI (e53b43b2)',
    event: 'planning',
    message: 'Plan: 1. Add runsState map, 2. Add /api/runs REST endpoint, 3. Support run_id tagging.',
    metadata: { context_pct: 22, tokens_per_sec: 56, is_exact: true }
  });

  await sendEvent({
    run_id: 'cli-mcp-worker',
    run_name: 'Claude Code (w2458a12)',
    event: 'planning',
    message: 'Plan: 1. Generate dark theme dashboard mockup, 2. Apply obsidian design tokens.',
    metadata: { context_pct: 38, tokens_per_sec: 45, is_exact: true }
  });

  await sleep(1800);

  // Step 3: Tool Execution Interleaved
  console.log('-> Sending Tool Calls for CLI 1 and CLI 2...');
  await sendEvent({
    run_id: 'cli-backend',
    run_name: 'Antigravity CLI (e53b43b2)',
    event: 'executing_tool',
    message: 'Reading file: server/server.js',
    metadata: { tool_name: 'view_file', target: 'server/server.js', context_pct: 26, tokens_per_sec: 60 }
  });

  await sendEvent({
    run_id: 'cli-mcp-worker',
    run_name: 'Claude Code (w2458a12)',
    event: 'executing_tool',
    message: 'Invoking Stitch MCP: generate_screen_from_text (Project ID: 48912903120)',
    metadata: { tool_name: 'generate_screen_from_text', target: 'StitchMCP: projects/48912903120', context_pct: 42, tokens_per_sec: 48 }
  });

  await sleep(2000);

  // Step 4: Terminal Command & Code Writes
  console.log('-> Sending Code Modification & Terminal Commands...');
  await sendEvent({
    run_id: 'cli-backend',
    run_name: 'Antigravity CLI (e53b43b2)',
    event: 'executing_tool',
    message: 'Executing terminal command: npm test',
    metadata: { tool_name: 'run_command', target: 'npm test', context_pct: 30, tokens_per_sec: 64 }
  });

  await sendEvent({
    run_id: 'cli-mcp-worker',
    run_name: 'Claude Code (w2458a12)',
    event: 'executing_tool',
    message: `[diff_block_start]
+ <div class="run-card">
+   <div class="run-card-header">Claude Code - Worker</div>
+ </div>
[diff_block_end]`,
    metadata: { tool_name: 'replace_file_content', target: 'public/index.html', context_pct: 46, tokens_per_sec: 50 }
  });

  await sleep(2200);

  // Step 5: Terminal Output & Completion
  console.log('-> Completing Tasks for Both Parallel CLIs...');
  await sendEvent({
    run_id: 'cli-backend',
    run_name: 'Antigravity CLI (e53b43b2)',
    event: 'executing_tool',
    message: 'PASS server/test/server.test.js\n  ✓ multi-run state routes verified (12ms)',
    metadata: { tool_name: 'run_command', target: 'Exit Code: 0', context_pct: 32 }
  });

  await sendEvent({
    run_id: 'cli-mcp-worker',
    run_name: 'Claude Code (w2458a12)',
    event: 'task_done',
    message: 'Stitch MCP UI screen generation & design token sync completed successfully!',
    metadata: { context_pct: 48, tokens_per_sec: 52, estimated_cost: '~$0.0024' }
  });

  await sleep(1000);

  await sendEvent({
    run_id: 'cli-backend',
    run_name: 'Antigravity CLI (e53b43b2)',
    event: 'task_done',
    message: 'Multi-run backend routing and WebSocket telemetry sync verified!',
    metadata: { context_pct: 34, tokens_per_sec: 62, estimated_cost: '~$0.0019' }
  });


  console.log('🎉 Parallel Multi-Run Telemetry Simulation Completed Successfully!');
}

runMultiSim().catch(console.error);
