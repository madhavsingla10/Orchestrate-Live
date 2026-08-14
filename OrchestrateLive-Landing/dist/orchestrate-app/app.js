/**
 * OrchestrateLive Core App Coordinator (Embedded Standalone Demo Mode)
 * Renders 4 active CLI agent runs in a parallel 2x2 grid.
 */
document.addEventListener('DOMContentLoaded', () => {
  const audioEngine = new window.AudioTelemetryEngine();
  audioEngine.setMuted(false);

  const audioToggle = document.getElementById('audio-toggle');
  const simStartBtn = document.getElementById('sim-start-btn');
  const multiRunContainer = document.getElementById('multi-run-container');

  const masterMetricLatency = document.getElementById('master-metric-latency');
  const masterMetricSpeed = document.getElementById('master-metric-speed');
  const masterMetricContext = document.getElementById('master-metric-context');
  const masterMetricCost = document.getElementById('master-metric-cost');

  if (audioToggle) {
    audioToggle.addEventListener('click', () => {
      const isMuted = audioEngine.muted;
      audioEngine.setMuted(!isMuted);
      audioToggle.innerHTML = !isMuted ? '<span class="icon">🔇</span> Audio Muted' : '<span class="icon">🔊</span> Audio Enabled';
    });
  }

  // Pre-configured 4 Active Agent Runs (1st: Claude Code, 2nd: Antigravity CLI, 3rd: Kilo CLI, 4th: Antigravity CLI (7a58e693))
  const agentRunsData = [
    {
      id: 'run-1',
      name: 'Claude Code (w2458a12)',
      color: '#f59e0b',
      status: 'TASK_DONE',
      latency: '2 ms',
      speed: '52 t/s',
      context: '48 %',
      cost: '1,890 in / 620 out',
      activeNode: 'done',
      logs: [
        { ts: '[01:04:43]', info: true, msg: 'Initialized telemetry stream for Claude Code (w2458a12)...' },
        { ts: '[01:04:43]', cyan: true, msg: 'Connecting to Stitch MCP server to retrieve project design schemas and UI variants...' },
        { ts: '[01:04:45]', amber: true, msg: 'Plan: 1. Generate dark theme dashboard mockup, 2. Apply obsidian design tokens.' },
        { ts: '[01:04:47]', pill: 'Stitch Screen Gen', msg: 'Invoking Stitch MCP: generate_screen_from_text (Project ID: 48912903120)', code: 'StitchMCP: projects/48912903120' },
        { ts: '[01:04:49]', pill: 'Edit File', msg: 'Modified file index.html', code: 'public/index.html' },
        { ts: '[01:04:51]', success: true, msg: 'Stitch MCP UI screen generation & design token sync complete.' }
      ]
    },
    {
      id: 'run-2',
      name: 'Antigravity CLI',
      color: '#00f5ff',
      status: 'TASK_DONE',
      latency: '50,170 ms',
      speed: '66 t/s',
      context: '42.1 %',
      cost: '1,420 in / 450 out',
      activeNode: 'done',
      logs: [
        { ts: '[01:02:04]', pill: 'Edit File', msg: 'Modified file server.js', code: 'server/server.js' },
        { ts: '[01:02:06]', pill: 'Run Command', msg: 'Executing terminal command: npm test -- --verbose', code: 'npm test' },
        { ts: '[01:02:07]', pill: 'Run Command', msg: 'ran npm test', code: 'Exit Code: 0' },
        { ts: '[01:02:09]', pill: 'Stitch Screen Gen', msg: 'Invoking Stitch MCP Tool: generate_screen_from_text (Project: 3376207430264469864)' },
        { ts: '[01:02:11]', success: true, msg: 'All telemetry metrics, server endpoints, and live real-time outputs verified cleanly! Session complete.' }
      ]
    },
    {
      id: 'run-3',
      name: 'Kilo CLI (e53b43b2)',
      color: '#00e676',
      status: 'TASK_DONE',
      latency: '0 ms',
      speed: '62 t/s',
      context: '34 %',
      cost: '3,120 in / 940 out',
      activeNode: 'done',
      logs: [
        { ts: '[01:04:43]', info: true, msg: 'Initialized telemetry stream for Kilo CLI (e53b43b2)...' },
        { ts: '[01:04:43]', cyan: true, msg: 'Analyzing Express bridge server and WebSocket streaming protocols for multi-run concurrency...' },
        { ts: '[01:04:45]', amber: true, msg: 'Plan: 1. Add runsState map, 2. Add /api/runs REST endpoint, 3. Support run_id tagging.' },
        { ts: '[01:04:46]', pill: 'View File', msg: 'Reading file: server/server.js', code: 'server/server.js' },
        { ts: '[01:04:49]', pill: 'Run Command', msg: 'Executing terminal command: npm test', code: 'npm test' },
        { ts: '[01:04:51]', pill: 'Run Command', msg: 'ran npm test', code: 'Exit Code: 0' },
        { ts: '[01:04:52]', success: true, msg: 'Multi-run backend routing and WebSocket telemetry sync verified!' }
      ]
    },
    {
      id: 'run-4',
      name: 'Antigravity CLI (7a58e693)',
      color: '#c084fc',
      status: 'RUN_COMMAND',
      latency: '3,790 ms',
      speed: '15 t/s',
      context: '0.6 %',
      cost: '2,850 in / 890 out',
      activeNode: 'terminal',
      logs: [
        { ts: '[01:04:21]', pill: 'Run Command', msg: 'ran "node -e \"http.get(\'http://localhost:3000/api/runs\', ...);\""', code: 'Exit Code: 0' },
        { ts: '[01:04:23]', pill: 'Run Command', msg: 'Executing terminal command: "node -e \"http.get(\'http://localhost:3000/api/runs\')\""' }
      ]
    }
  ];

  updateMasterMetrics();
  renderMultiRunGrid();

  function updateMasterMetrics() {
    if (masterMetricLatency) masterMetricLatency.textContent = '13,490 ms';
    if (masterMetricSpeed) masterMetricSpeed.textContent = '49 t/s';
    if (masterMetricContext) masterMetricContext.textContent = '31.2 %';
    if (masterMetricCost) masterMetricCost.textContent = '9,280 in / 2,900 out';
  }

  function renderMultiRunGrid() {
    if (!multiRunContainer) return;
    multiRunContainer.innerHTML = '';

    agentRunsData.forEach(run => {
      const card = document.createElement('div');
      card.className = 'run-card';
      card.id = `card-${run.id}`;

      let logsHtml = '';
      run.logs.forEach(l => {
        if (l.success) {
          logsHtml += `<div class="console-row" style="color:#00e676; font-weight:600;"><span class="timestamp">${l.ts}</span> <span class="message">${l.msg}</span></div>`;
        } else if (l.cyan) {
          logsHtml += `<div class="console-row" style="color:#38bdf8;"><span class="timestamp">${l.ts}</span> <span class="message">${l.msg}</span></div>`;
        } else if (l.amber) {
          logsHtml += `<div class="console-row" style="color:#fbbf24;"><span class="timestamp">${l.ts}</span> <span class="message">${l.msg}</span></div>`;
        } else if (l.info) {
          logsHtml += `<div class="console-row" style="color:#71717a;"><span class="timestamp">${l.ts}</span> <span class="message">${l.msg}</span></div>`;
        } else {
          logsHtml += `<div class="console-row">
            <span class="timestamp">${l.ts}</span>
            <span class="badge badge-tool">${l.pill}</span>
            <span class="message">${l.msg} ${l.code ? `<span class="badge badge-target">${l.code}</span>` : ''}</span>
          </div>`;
        }
      });

      card.innerHTML = `
        <div class="run-card-header">
          <div class="run-title-group">
            <span class="run-color-bar" style="background-color: ${run.color};"></span>
            <span class="run-title">${run.name}</span>
          </div>
          <span class="run-status-badge ${run.status.toLowerCase()}">${run.status}</span>
        </div>
        <div class="run-metrics-strip">
          <div class="run-metric-item">
            <span class="run-metric-label">LATENCY</span>
            <span class="run-metric-val">${run.latency}</span>
          </div>
          <div class="run-metric-item">
            <span class="run-metric-label">SPEED</span>
            <span class="run-metric-val">${run.speed}</span>
          </div>
          <div class="run-metric-item">
            <span class="run-metric-label">CONTEXT</span>
            <span class="run-metric-val">${run.context}</span>
          </div>
          <div class="run-metric-item">
            <span class="run-metric-label">TOKENS</span>
            <span class="run-metric-val metric-run-cost">${run.cost}</span>
          </div>
        </div>
        <div class="run-pipeline-container">
          <div class="run-pipeline-flow">
            <div class="pipeline-node"><div class="indicator-ring"><div class="indicator-dot"></div></div><span class="node-label">Thought</span></div>
            <div class="flow-arrow"></div>
            <div class="pipeline-node"><div class="indicator-ring"><div class="indicator-dot"></div></div><span class="node-label">Plan</span></div>
            <div class="flow-arrow"></div>
            <div class="pipeline-node"><div class="indicator-ring"><div class="indicator-dot"></div></div><span class="node-label">Read</span></div>
            <div class="flow-arrow"></div>
            <div class="pipeline-node"><div class="indicator-ring"><div class="indicator-dot"></div></div><span class="node-label">Write</span></div>
            <div class="flow-arrow"></div>
            <div class="pipeline-node"><div class="indicator-ring"><div class="indicator-dot" style="${run.activeNode === 'terminal' ? 'background:#c084fc; box-shadow:0 0 8px #c084fc;' : ''}"></div></div><span class="node-label">Term</span></div>
            <div class="flow-arrow"></div>
            <div class="pipeline-node"><div class="indicator-ring"><div class="indicator-dot" style="${run.activeNode === 'done' ? 'background:#00e676; box-shadow:0 0 8px #00e676;' : ''}"></div></div><span class="node-label">Done</span></div>
          </div>
        </div>
        <div class="run-console-viewport">
          ${logsHtml}
        </div>
      `;
      multiRunContainer.appendChild(card);
    });
  }

  // Interactive Live Demo Stream Trigger
  if (simStartBtn) {
    simStartBtn.addEventListener('click', () => {
      audioEngine.trigger('thinking');
      runLiveDemoAnimation();
    });
  }

  async function runLiveDemoAnimation() {
    simStartBtn.disabled = true;
    simStartBtn.style.opacity = '0.5';

    highlightCardElement('card-run-1', '#f59e0b');
    audioEngine.trigger('executing_tool', 'replace_file_content');
    await delay(1000);

    highlightCardElement('card-run-2', '#00f5ff');
    audioEngine.trigger('executing_tool', 'view_file');
    await delay(1000);

    highlightCardElement('card-run-3', '#00e676');
    audioEngine.trigger('executing_tool', 'run_command');
    await delay(1000);

    highlightCardElement('card-run-4', '#c084fc');
    audioEngine.trigger('task_done');
    await delay(1200);

    simStartBtn.disabled = false;
    simStartBtn.style.opacity = '1';
  }

  function highlightCardElement(cardId, glowColor) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.style.borderColor = glowColor;
    card.style.boxShadow = `0 0 20px ${glowColor}40`;
    setTimeout(() => {
      card.style.borderColor = 'rgba(255, 255, 255, 0.07)';
      card.style.boxShadow = 'none';
    }, 1500);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});
