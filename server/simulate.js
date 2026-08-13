const http = require('http');

// Check CLI flags
const runErrorFlow = process.argv.includes('--error');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Normal success flow simulation steps
const successSteps = [
  {
    event: 'thinking',
    message: 'Analyzing workspace to fix layout bug in navbar...',
    metadata: { context_pct: 35 },
    delay: 2000
  },
  {
    event: 'planning',
    message: 'Formulating step-by-step resolution plan for navbar spacing.',
    metadata: { context_pct: 35 },
    delay: 2500
  },
  {
    event: 'executing_tool',
    message: 'Reading file public/index.html to check layout headers.',
    metadata: { tool_name: 'view_file', target: 'public/index.html', context_pct: 42 },
    delay: 2000
  },
  {
    event: 'thinking',
    message: 'Deciding on correct CSS class names to apply to navigation links.',
    metadata: { context_pct: 45 },
    delay: 1500
  },
  {
    event: 'executing_tool',
    message: 'Modifying flex layout properties in public/style.css',
    metadata: { tool_name: 'replace_file_content', target: 'public/style.css', context_pct: 48 },
    delay: 3000
  },
  {
    event: 'executing_tool',
    message: 'Running lint check to verify stylesheet structure.',
    metadata: { tool_name: 'run_command', target: 'npm run lint', context_pct: 50 },
    delay: 2500
  },
  {
    event: 'task_done',
    message: 'Header layout successfully fixed. Lint checks passed.',
    metadata: { elapsed_seconds: 14, tokens_per_sec: 42.5, context_pct: 50 },
    delay: 1000
  }
];

// Error flow simulation steps
const errorSteps = [
  {
    event: 'thinking',
    message: 'Reading application logs to debug database connection failure...',
    metadata: { context_pct: 65 },
    delay: 2000
  },
  {
    event: 'executing_tool',
    message: 'Running db migration script...',
    metadata: { tool_name: 'run_command', target: 'npm run db:migrate', context_pct: 72 },
    delay: 3000
  },
  {
    event: 'task_error',
    message: 'Database migration failed: Connection timeout after 10000ms.',
    metadata: { elapsed_seconds: 12, tokens_per_sec: 15.2, context_pct: 75 },
    delay: 1000
  }
];

/**
 * Sends a telemetry event packet to the Bridge Server.
 */
function sendTelemetry(event, message, metadata = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      message,
      metadata
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/telemetry',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ status: 'unknown', data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Runs the simulation sequence step-by-step.
 */
async function runSimulation() {
  const steps = runErrorFlow ? errorSteps : successSteps;
  console.log(`[Simulator] Starting AI Agent Telemetry Simulation (${runErrorFlow ? 'ERROR' : 'SUCCESS'} FLOW)...`);
  console.log('[Simulator] Ensure the Bridge Server is running on port 3000.\n');

  for (const step of steps) {
    try {
      const res = await sendTelemetry(step.event, step.message, step.metadata);
      console.log(`[Simulator] Sent event: "${step.event}" -> Response status: ${res.status} (Notified: ${res.clientsNotified})`);
    } catch (err) {
      console.error(`[Simulator] Error sending event: ${err.message}`);
    }
    await sleep(step.delay);
  }

  console.log('\n[Simulator] Simulation sequence completed successfully.');
}

runSimulation();
