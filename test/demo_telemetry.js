/**
 * Telemetry Demo Script for OrchestrateLive
 * Streams sample events including MCP tool calls to test glowing LED node and log filter.
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

async function runDemo() {
  console.log('🚀 Starting OrchestrateLive Demo Stream...');

  // Event 1: Agent Thought
  await sendEvent({
    event: 'thinking',
    message: 'Analyzing DOM structure and pipeline flowchart nodes for MCP tool integration...',
    metadata: { context_pct: 28, tokens_per_sec: 44, is_exact: true }
  });
  console.log('-> Sent: Thinking Event');
  await sleep(1500);

  // Event 2: Planning
  await sendEvent({
    event: 'planning',
    message: 'Structuring step plan: 1. Add MCP LED node to pipeline map, 2. Add MCP filter pill, 3. Integrate Stitch MCP tool telemetry.',
    metadata: { context_pct: 32, tokens_per_sec: 48, is_exact: true }
  });
  console.log('-> Sent: Planning Event');
  await sleep(1800);

  // Event 3: MCP Tool Call (Stitch MCP Screen Generation)
  await sendEvent({
    event: 'executing_tool',
    message: 'Generating high-fidelity UI screen over Stitch MCP: generate_screen_from_text (Project ID: 3376207430264469864)',
    metadata: { tool_name: 'generate_screen_from_text', target: 'StitchMCP: projects/3376207430264469864', context_pct: 36 }
  });
  console.log('-> Sent: MCP Tool Call (Stitch MCP - Glowing LED Active)');
  await sleep(2200);

  // Event 4: Code Edit with Diff
  await sendEvent({
    event: 'executing_tool',
    message: `[diff_block_start]
- <!-- Node 5: Terminal -->
+ <!-- Node 6: MCP Tools -->
+ <div class="pipeline-node" id="node-mcp">
+   <div class="indicator-ring"><div class="indicator-dot"></div></div>
+   <div class="node-label">MCP</div>
+ </div>
[diff_block_end]`,
    metadata: { tool_name: 'replace_file_content', target: 'public/index.html', context_pct: 40, tokens_per_sec: 52 }
  });
  console.log('-> Sent: Tool Call (replace_file_content with Code Diff)');
  await sleep(2000);

  // Event 5: Task Done
  await sendEvent({
    event: 'task_done',
    message: 'MCP glowing LED pipeline node and Live Activity Logs console redesign successfully active!',
    metadata: { context_pct: 44, tokens_per_sec: 50, estimated_cost: '~$0.0019' }
  });
  console.log('🎉 Demo Stream Complete!');
}

runDemo().catch(console.error);
