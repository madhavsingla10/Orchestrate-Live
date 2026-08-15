/**
 * OrchestrateLive Core App Coordinator (Multi-Run Enabled)
 * Coordinates WebSockets, Multi-Run parallel cards, UI state, and Audio synthesis.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Web Audio engine instance
  const audioEngine = new window.AudioTelemetryEngine();
  
  // DOM Elements - Global & Layout Controls
  const audioToggle = document.getElementById('audio-toggle');
  const connectionBadge = document.getElementById('connection-badge');
  const activeRunsCountBadge = document.getElementById('active-runs-count');
  
  const multiRunContainer = document.getElementById('multi-run-container');
  const singleFocusSection = document.getElementById('single-focus-section');
  const runTabBar = document.getElementById('run-tab-bar');

  // DOM Elements - Summary Cards & Master Metrics Ribbon for All Runs Grid View
  const summaryCardsContainer = document.getElementById('summary-cards-container');
  const masterMetricsRibbon = document.getElementById('master-metrics-ribbon');
  const masterMetricLatency = document.getElementById('master-metric-latency');
  const masterMetricSpeed = document.getElementById('master-metric-speed');
  const masterMetricContext = document.getElementById('master-metric-context');
  const masterMetricCost = document.getElementById('master-metric-cost');
  // DOM Elements - Collapsible Section Divider Bars
  const summarySectionToggle = document.getElementById('summary-section-toggle');
  const detailedSectionToggle = document.getElementById('detailed-section-toggle');

  if (summarySectionToggle && summaryCardsContainer) {
    summarySectionToggle.addEventListener('click', () => {
      const isCollapsed = summaryCardsContainer.classList.toggle('collapsed-section');
      summarySectionToggle.classList.toggle('collapsed', isCollapsed);
    });
  }

  if (detailedSectionToggle && multiRunContainer) {
    detailedSectionToggle.addEventListener('click', () => {
      const isCollapsed = multiRunContainer.classList.toggle('collapsed-section');
      detailedSectionToggle.classList.toggle('collapsed', isCollapsed);
    });
  }

  // DOM Elements - Reset Controls & Modal Warning
  const resetDashboardBtn = document.getElementById('reset-dashboard-btn');
  const resetModal = document.getElementById('reset-modal');
  const btnCancelReset = document.getElementById('btn-cancel-reset');
  const btnConfirmReset = document.getElementById('btn-confirm-reset');

  // DOM Elements - Single View Fallback Controls
  const singlePipelineContainer = document.getElementById('single-pipeline-container');
  const consoleFeed = document.getElementById('console-feed');
  const clearConsoleBtn = document.getElementById('clear-console-btn');
  const metricLatency = document.getElementById('metric-latency');
  const metricSpeed = document.getElementById('metric-speed');
  const metricContext = document.getElementById('metric-context');
  const metricCost = document.getElementById('metric-cost');
  const badgeSpeed = document.getElementById('badge-speed');
  const badgeContext = document.getElementById('badge-context');
  const badgeCost = document.getElementById('badge-cost');


  const singleNodes = {
    thinking: document.getElementById('node-thinking'),
    planning: document.getElementById('node-planning'),
    reading: document.getElementById('node-reading'),
    writing: document.getElementById('node-writing'),
    terminal: document.getElementById('node-terminal'),
    mcp: document.getElementById('node-mcp'),
    task_done: document.getElementById('node-task_done')
  };

  // State Management
  let activeTabRunId = 'all';         // 'all' or specific run_id
  let reconnectDelay = 2000;
  let socket = null;

  // Registered Runs Store
  const runsStore = {};

  // Log Filtering State for Single View
  const logSearchInput = document.getElementById('log-search-input');
  const btnRegexToggle = document.getElementById('btn-regex-toggle');
  const filterPillsContainer = document.getElementById('filter-pills');
  const autoscrollToggleBtn = document.getElementById('autoscroll-toggle-btn');
  const logCountBadge = document.getElementById('log-count-badge');

  let currentFilter = 'all';
  let searchQuery = '';
  let isRegexMode = false;
  let isAutoscroll = true;

  // --- Run Tab Bar Event Listener ---
  if (runTabBar) {
    runTabBar.addEventListener('click', (e) => {
      const tab = e.target.closest('.run-tab');
      if (!tab) return;
      
      runTabBar.querySelectorAll('.run-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTabRunId = tab.dataset.runId;

      updateTabFocus();
    });
  }

  function formatSingleTokenCount(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toLocaleString();
  }

  function formatTokenPair(inTokens, outTokens) {
    if (typeof inTokens !== 'number' || typeof outTokens !== 'number') return '-- in / -- out';
    return `${formatSingleTokenCount(inTokens)} in / ${formatSingleTokenCount(outTokens)} out`;
  }

  function resetAllClientState() {
    try {
      localStorage.removeItem('orchestrate_runs_v3');
      localStorage.removeItem('orchestrate_runs_v2');
      localStorage.removeItem('orchestrate_runs_v1');
    } catch (e) {}

    Object.keys(runsStore).forEach(key => delete runsStore[key]);

    if (summaryCardsContainer) summaryCardsContainer.innerHTML = '';
    if (multiRunContainer) multiRunContainer.innerHTML = '';
    if (consoleFeed) consoleFeed.innerHTML = '';

    if (runTabBar) {
      runTabBar.innerHTML = `
        <button class="run-tab active" data-run-id="all">
          <span class="run-tab-dot" style="background-color: #00f5ff;"></span>
          <span class="run-tab-label">All Runs</span>
        </button>
      `;
    }

    if (masterMetricLatency) masterMetricLatency.textContent = '-- ms';
    if (masterMetricSpeed) masterMetricSpeed.textContent = '-- t/s';
    if (masterMetricContext) masterMetricContext.textContent = '-- %';
    if (masterMetricCost) masterMetricCost.textContent = '-- in / -- out';

    if (activeRunsCountBadge) activeRunsCountBadge.textContent = '0 Active Runs';

    activeTabRunId = 'all';
    updateTabFocus();
  }

  // Reset Confirmation Warning Modal Setup
  if (resetDashboardBtn && resetModal) {
    resetDashboardBtn.addEventListener('click', () => {
      resetModal.classList.remove('hidden');
    });

    if (btnCancelReset) {
      btnCancelReset.addEventListener('click', () => {
        resetModal.classList.add('hidden');
      });
    }

    resetModal.addEventListener('click', (e) => {
      if (e.target === resetModal) {
        resetModal.classList.add('hidden');
      }
    });

    if (btnConfirmReset) {
      btnConfirmReset.addEventListener('click', async () => {
        resetModal.classList.add('hidden');
        resetAllClientState();
        try {
          await fetch('/api/runs/reset', { method: 'POST' });
        } catch (err) {
          console.error('Failed to trigger server reset:', err);
        }
      });
    }
  }

  function persistRunsState() {
    try {
      const serialized = {};
      Object.keys(runsStore).forEach(id => {
        const r = runsStore[id];
        serialized[id] = {
          run_id: r.run_id,
          run_name: r.run_name,
          color: r.color,
          lastLatency: r.lastLatency,
          lastSpeed: r.lastSpeed,
          lastContext: r.lastContext,
          isExactTokens: r.isExactTokens,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          lastTokensStr: r.lastTokensStr,
          lastActiveEvent: r.lastActiveEvent,
          lastToolName: r.lastToolName,
          statusBadgeText: r.statusBadgeText,
          logs: r.logs || []
        };
      });
      localStorage.setItem('orchestrate_runs_v3', JSON.stringify(serialized));
    } catch (e) {}
  }

  function restoreRunsState() {
    try {
      const raw = localStorage.getItem('orchestrate_runs_v3');
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.values(data).forEach(r => {
        const runObj = getOrCreateRunUI(r.run_id, r.run_name, r.color);
        if (typeof r.lastLatency === 'number') {
          runObj.lastLatency = r.lastLatency;
          if (runObj.metricsEls.latency) runObj.metricsEls.latency.textContent = `${r.lastLatency} ms`;
          if (runObj.metricsEls.summaryLatency) runObj.metricsEls.summaryLatency.textContent = `${r.lastLatency} ms`;
        }
        if (typeof r.lastSpeed === 'number') {
          runObj.lastSpeed = r.lastSpeed;
          if (runObj.metricsEls.speed) runObj.metricsEls.speed.textContent = `${r.lastSpeed} t/s`;
          if (runObj.metricsEls.summarySpeed) runObj.metricsEls.summarySpeed.textContent = `${r.lastSpeed} t/s`;
        }
        if (typeof r.lastContext === 'number') {
          runObj.lastContext = r.lastContext;
          if (runObj.metricsEls.context) runObj.metricsEls.context.textContent = `${r.lastContext} %`;
          if (runObj.metricsEls.summaryContext) runObj.metricsEls.summaryContext.textContent = `${r.lastContext} %`;
        }
        if (r.isExactTokens && typeof r.inputTokens === 'number' && typeof r.outputTokens === 'number') {
          runObj.isExactTokens = true;
          runObj.inputTokens = r.inputTokens;
          runObj.outputTokens = r.outputTokens;
          runObj.lastTokensStr = r.lastTokensStr || formatTokenPair(r.inputTokens, r.outputTokens);
          if (runObj.metricsEls.cost) runObj.metricsEls.cost.textContent = runObj.lastTokensStr;
          if (runObj.metricsEls.summaryCost) runObj.metricsEls.summaryCost.textContent = runObj.lastTokensStr;
        }
        if (r.lastActiveEvent) {
          runObj.lastActiveEvent = r.lastActiveEvent;
          runObj.lastToolName = r.lastToolName;
          updateRunPipelineUI(runObj, r.lastActiveEvent, r.lastToolName);
        }
        if (r.statusBadgeText) {
          runObj.statusBadgeText = r.statusBadgeText;
          if (runObj.metricsEls.statusBadge) {
            runObj.metricsEls.statusBadge.textContent = r.statusBadgeText;
            runObj.metricsEls.statusBadge.className = `run-status-badge ${r.statusBadgeText.toLowerCase()}`;
          }
          if (runObj.metricsEls.summaryBadge) {
            runObj.metricsEls.summaryBadge.textContent = r.statusBadgeText;
            runObj.metricsEls.summaryBadge.className = `run-status-badge ${r.statusBadgeText.toLowerCase()}`;
          }
        }

        if (Array.isArray(r.logs) && r.logs.length > 0) {
          runObj.logs = [];
          r.logs.forEach(logItem => {
            appendEventToConsole(runObj, logItem.event, logItem.message, logItem.metadata, logItem.isError, logItem.timestamp);
          });
        }
      });
      computeMasterFocusMetrics();
    } catch (e) {}
  }


  function computeMasterFocusMetrics() {
    const runs = Object.values(runsStore).filter(r => !r.isMinimized);
    if (runs.length === 0) {
      if (masterMetricLatency) masterMetricLatency.textContent = '-- ms';
      if (masterMetricSpeed) masterMetricSpeed.textContent = '-- t/s';
      if (masterMetricContext) masterMetricContext.textContent = '-- %';
      if (masterMetricCost) masterMetricCost.textContent = '-- in / -- out';
      return;
    }

    let sumLatency = 0, countLatency = 0;
    let sumSpeed = 0, countSpeed = 0;
    let sumContext = 0, countContext = 0;
    let totalIn = 0, totalOut = 0, countTokens = 0;
    runs.forEach(run => {
      if (typeof run.lastLatency === 'number') { sumLatency += run.lastLatency; countLatency++; }
      if (typeof run.lastSpeed === 'number') { sumSpeed += run.lastSpeed; countSpeed++; }
      if (typeof run.lastContext === 'number') { sumContext += run.lastContext; countContext++; }
      if (run.isExactTokens && typeof run.inputTokens === 'number' && typeof run.outputTokens === 'number') {
        totalIn += run.inputTokens;
        totalOut += run.outputTokens;
        countTokens++;
      }
    });

    const avgLatency = countLatency > 0 ? Math.round(sumLatency / countLatency) : 0;
    const avgSpeed = countSpeed > 0 ? Math.round(sumSpeed / countSpeed) : 0;
    const avgContext = countContext > 0 ? (Math.round((sumContext / countContext) * 10) / 10) : 0;

    if (masterMetricLatency) masterMetricLatency.textContent = `${avgLatency} ms`;
    if (masterMetricSpeed) masterMetricSpeed.textContent = `${avgSpeed} t/s`;
    if (masterMetricContext) masterMetricContext.textContent = `${avgContext} %`;
    if (masterMetricCost) masterMetricCost.textContent = countTokens > 0 ? formatTokenPair(totalIn, totalOut) : '-- in / -- out';
  }

  function updateTabFocus() {
    if (activeTabRunId === 'all') {
      singleFocusSection.classList.remove('individual-run-mode');
      singleFocusSection.classList.add('hidden');
      
      if (masterMetricsRibbon) masterMetricsRibbon.classList.remove('hidden');
      if (summarySectionToggle) summarySectionToggle.classList.remove('hidden');
      if (summaryCardsContainer) summaryCardsContainer.classList.remove('hidden');
      if (detailedSectionToggle) detailedSectionToggle.classList.remove('hidden');
      if (multiRunContainer) multiRunContainer.className = 'multi-run-grid parallel-mode';

      Object.values(runsStore).forEach(run => {
        if (run.cardEl) run.cardEl.classList.remove('hidden');
        if (run.summaryCardEl) run.summaryCardEl.classList.remove('hidden');
      });

      computeMasterFocusMetrics();
    } else {
      // Specific CLI tab selected (e.g., 'Antigravity CLI (e53b43b2)')
      singleFocusSection.classList.add('individual-run-mode');

      if (masterMetricsRibbon) masterMetricsRibbon.classList.add('hidden');
      if (summarySectionToggle) summarySectionToggle.classList.add('hidden');
      if (summaryCardsContainer) summaryCardsContainer.classList.add('hidden');
      if (detailedSectionToggle) detailedSectionToggle.classList.add('hidden');
      if (multiRunContainer) multiRunContainer.className = 'multi-run-grid hidden';

      // Display Full Focus View for this specific CLI
      singleFocusSection.classList.remove('hidden');
      if (singlePipelineContainer) singlePipelineContainer.classList.remove('hidden');


      // Reset badges to Live / Real-Time for single run
      if (badgeSpeed) { badgeSpeed.className = 'metric-badge live'; badgeSpeed.textContent = 'LIVE'; }
      if (badgeContext) { badgeContext.className = 'metric-badge live'; badgeContext.textContent = 'LIVE'; }
      if (badgeCost) { badgeCost.className = 'metric-badge in-out'; badgeCost.textContent = 'IN / OUT'; }

      // Populate Focus View Metrics & Pipeline Map with this specific CLI's state
      const targetRun = runsStore[activeTabRunId];
      if (targetRun) {
        if (metricLatency) metricLatency.textContent = targetRun.metricsEls.latency ? targetRun.metricsEls.latency.textContent : '-- ms';
        if (metricSpeed) metricSpeed.textContent = targetRun.metricsEls.speed ? targetRun.metricsEls.speed.textContent : '-- t/s';
        if (metricContext) metricContext.textContent = targetRun.metricsEls.context ? targetRun.metricsEls.context.textContent : '-- %';
        if (metricCost) metricCost.textContent = targetRun.metricsEls.cost ? targetRun.metricsEls.cost.textContent : '-- in / -- out';
        updateSinglePipelineUI(targetRun.lastActiveEvent || 'idle', targetRun.lastToolName);
      }

      // Filter Activity Console Feed to logs belonging to this specific CLI
      applyLogFilters();
    }
  }







  // --- Dynamic Run Card Creation ---
  function getOrCreateRunUI(runId, runName, runColor) {
    if (runsStore[runId]) return runsStore[runId];

    const color = runColor || '#00f5ff';
    const name = runName || (runId === 'cli-main' ? 'CLI 1 - Main' : `CLI (${runId})`);

    // 1. Create Tab Button in Header Tab Bar
    const tabEl = document.createElement('button');
    tabEl.className = 'run-tab';
    tabEl.dataset.runId = runId;
    tabEl.innerHTML = `
      <span class="run-tab-dot" style="background-color: ${color}; color: ${color};"></span>
      <span class="run-tab-label">${escapeHtml(name)}</span>
    `;
    runTabBar.appendChild(tabEl);

    // 2. Create Compact Square Summary Card (4 in a row, matching image copy 8.png)
    const summaryCardEl = document.createElement('div');
    summaryCardEl.className = 'summary-card';
    summaryCardEl.id = `summary-card-${runId}`;
    summaryCardEl.innerHTML = `
      <div class="card-blur-glow"></div>
      <div class="summary-card-header">
        <div class="run-title-group">
          <div class="run-color-bar" style="background-color: ${color};"></div>
          <div class="run-title">${escapeHtml(name)}</div>
        </div>
        <div class="run-status-badge IDLE">IDLE</div>
      </div>

      <div class="run-metrics-strip">
        <div class="run-metric-item">
          <span class="run-metric-label">LATENCY</span>
          <span class="run-metric-val metric-run-latency">-- ms</span>
        </div>
        <div class="run-metric-item">
          <span class="run-metric-label">SPEED</span>
          <span class="run-metric-val metric-run-speed">-- t/s</span>
        </div>
        <div class="run-metric-item">
          <span class="run-metric-label">CONTEXT</span>
          <span class="run-metric-val metric-run-context">-- %</span>
        </div>
        <div class="run-metric-item">
          <span class="run-metric-label">TOKENS</span>
          <span class="run-metric-val metric-run-cost">-- in / -- out</span>
        </div>
      </div>
    `;

    summaryCardEl.addEventListener('click', () => {
      activeTabRunId = runId;
      runTabBar.querySelectorAll('.run-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.runId === runId);
      });
      updateTabFocus();
    });

    if (summaryCardsContainer) summaryCardsContainer.appendChild(summaryCardEl);

    // 3. Create Full Detailed Card (Stacked below in multi-run grid)
    const cardEl = document.createElement('div');
    cardEl.className = 'run-card';
    cardEl.id = `run-card-${runId}`;

    cardEl.innerHTML = `
      <div class="card-blur-glow"></div>
      <div class="run-card-header">
        <div class="run-title-group">
          <div class="run-color-bar" style="background-color: ${color};"></div>
          <div class="run-title">${escapeHtml(name)}</div>
        </div>
        <div class="run-status-badge IDLE">IDLE</div>
      </div>

      <div class="run-metrics-strip">
        <div class="run-metric-item">
          <span class="run-metric-label">LATENCY</span>
          <span class="run-metric-val metric-run-latency">-- ms</span>
        </div>
        <div class="run-metric-item">
          <span class="run-metric-label">SPEED</span>
          <span class="run-metric-val metric-run-speed">-- t/s</span>
        </div>
        <div class="run-metric-item">
          <span class="run-metric-label">CONTEXT</span>
          <span class="run-metric-val metric-run-context">-- %</span>
        </div>
        <div class="run-metric-item">
          <span class="run-metric-label">TOKENS</span>
          <span class="run-metric-val metric-run-cost">-- in / -- out</span>
        </div>
      </div>

      <!-- Wave Pipeline Indicator Track (Traveling Dot on Green Wave) -->
      <div class="wave-pipeline-track" id="wave-track-${runId}">
        <div class="wave-pipeline-track-svg-wrapper">
          <svg class="wave-pipeline-svg" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="wave-grad-${runId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#a3e635" stop-opacity="0.3"></stop>
                <stop offset="100%" stop-color="#a3e635" stop-opacity="0.0"></stop>
              </linearGradient>
            </defs>
            <path class="wave-path-line" d="M 0,55 C 35,55 50,48 71.4,48 C 120,48 160,30 214.3,30 C 270,30 300,44 357.1,44 C 410,44 450,26 500,26 C 550,26 590,42 642.9,42 C 700,42 730,28 785.7,28 C 840,28 880,46 928.6,46 C 960,46 980,50 1000,50" fill="none" stroke="#a3e635" stroke-width="2.5"></path>
            <path d="M 0,55 C 35,55 50,48 71.4,48 C 120,48 160,30 214.3,30 C 270,30 300,44 357.1,44 C 410,44 450,26 500,26 C 550,26 590,42 642.9,42 C 700,42 730,28 785.7,28 C 840,28 880,46 928.6,46 C 960,46 980,50 1000,50 L 1000,100 L 0,100 Z" fill="url(#wave-grad-${runId})"></path>
          </svg>

          <!-- The Traveling Glowing Indicator Dot Centered Directly on the Green Line -->
          <div class="wave-indicator-dot" style="left: 7.14%; top: 48%;">
            <div class="aurora-dot-core"></div>
            <div class="aurora-dot-pulse"></div>
          </div>
        </div>

        <!-- Stage Labels along the 7-grid Wave Line -->
        <div class="wave-stage-labels">
          <div class="wave-stage-label stage-thinking active" data-stage="thinking">Thought</div>
          <div class="wave-stage-label stage-planning" data-stage="planning">Planning</div>
          <div class="wave-stage-label stage-reading" data-stage="reading">Reading</div>
          <div class="wave-stage-label stage-writing" data-stage="writing">Writing</div>
          <div class="wave-stage-label stage-terminal" data-stage="terminal">Terminal</div>
          <div class="wave-stage-label stage-mcp" data-stage="mcp">MCP</div>
          <div class="wave-stage-label stage-task_done" data-stage="task_done">Done</div>
        </div>
      </div>

      <div class="run-console-viewport font-mono" id="run-console-${runId}">
        <div class="console-row system-msg">
          <span class="timestamp">[${new Date().toTimeString().split(' ')[0]}]</span>
          <span class="message">Initialized telemetry stream for ${escapeHtml(name)}...</span>
        </div>
      </div>
    `;

    multiRunContainer.appendChild(cardEl);

    // Extract reference pointers
    const waveDotEl = cardEl.querySelector('.wave-indicator-dot');
    const stageLabels = {
      thinking: cardEl.querySelector('.stage-thinking'),
      planning: cardEl.querySelector('.stage-planning'),
      reading: cardEl.querySelector('.stage-reading'),
      writing: cardEl.querySelector('.stage-writing'),
      terminal: cardEl.querySelector('.stage-terminal'),
      mcp: cardEl.querySelector('.stage-mcp'),
      task_done: cardEl.querySelector('.stage-task_done')
    };

    const metricsEls = {
      latency: cardEl.querySelector('.metric-run-latency'),
      speed: cardEl.querySelector('.metric-run-speed'),
      context: cardEl.querySelector('.metric-run-context'),
      cost: cardEl.querySelector('.metric-run-cost'),
      statusBadge: cardEl.querySelector('.run-status-badge'),
      summaryLatency: summaryCardEl.querySelector('.metric-run-latency'),
      summarySpeed: summaryCardEl.querySelector('.metric-run-speed'),
      summaryContext: summaryCardEl.querySelector('.metric-run-context'),
      summaryCost: summaryCardEl.querySelector('.metric-run-cost'),
      summaryBadge: summaryCardEl.querySelector('.run-status-badge')
    };

    const consoleEl = cardEl.querySelector(`#run-console-${runId}`);

    runsStore[runId] = {
      run_id: runId,
      run_name: name,
      color: color,
      cardEl,
      summaryCardEl,
      tabEl,
      waveDotEl,
      stageLabels,
      metricsEls,
      consoleEl,
      lastRunningCommand: '',
      lastReadingFile: '',
      lastEditingFile: ''
    };

    updateActiveRunsCount();
    return runsStore[runId];
  }

  const STAGE_POSITIONS = {
    idle:        { left: '7.14%',  top: '48%', label: 'thinking' },
    thinking:    { left: '7.14%',  top: '48%', label: 'thinking' },
    planning:    { left: '21.43%', top: '30%', label: 'planning' },
    reading:     { left: '35.71%', top: '44%', label: 'reading' },
    writing:     { left: '50.00%', top: '26%', label: 'writing' },
    terminal:    { left: '64.29%', top: '42%', label: 'terminal' },
    mcp:         { left: '78.57%', top: '28%', label: 'mcp' },
    task_done:   { left: '92.86%', top: '46%', label: 'task_done' },
    task_error:  { left: '92.86%', top: '46%', label: 'task_done' }
  };

  let previousRunCount = 0;

  function autoManageTabSelection() {
    const runIds = Object.keys(runsStore);
    const count = runIds.length;

    if (count === 1 && previousRunCount !== 1) {
      activeTabRunId = runIds[0];
      if (runTabBar) {
        runTabBar.querySelectorAll('.run-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.runId === activeTabRunId);
        });
      }
      updateTabFocus();
    } else if (count > 1 && (previousRunCount <= 1 || activeTabRunId !== 'all')) {
      activeTabRunId = 'all';
      if (runTabBar) {
        runTabBar.querySelectorAll('.run-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.runId === 'all');
        });
      }
      updateTabFocus();
    }

    previousRunCount = count;
  }

  function updateActiveRunsCount() {
    const count = Object.keys(runsStore).length;
    if (activeRunsCountBadge) {
      activeRunsCountBadge.textContent = `${count} Active Run${count !== 1 ? 's' : ''}`;
    }
    autoManageTabSelection();
  }

  // Updates traveling wave dot and stage indicators for a specific run
  function updateRunPipelineUI(runObj, activeEvent, toolName) {
    if (!runObj) return;

    let badgeText = 'IDLE';
    let badgeClass = 'IDLE';
    let stageName = 'thinking';

    if (activeEvent === 'task_error') {
      badgeText = 'ERROR';
      badgeClass = 'task_error';
      stageName = 'task_error';
    } else if (activeEvent === 'executing_tool') {
      badgeText = toolName ? formatToolBadgeName(toolName) : 'EXECUTING';
      badgeClass = 'executing_tool';

      const lower = (toolName || '').toLowerCase();
      if (lower.includes('mcp') || lower.includes('stitch') || ['call_mcp_tool', 'create_project', 'generate_screen_from_text', 'edit_screens', 'todowrite', 'todoread'].includes(lower)) {
        stageName = 'mcp';
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content', 'code_action', 'write', 'edit', 'multiedit'].includes(lower) || lower.includes('write') || lower.includes('edit')) {
        stageName = 'writing';
      } else if (['run_command', 'bash', 'terminal', 'cmd'].includes(lower) || lower.includes('bash') || lower.includes('command')) {
        stageName = 'terminal';
      } else {
        stageName = 'reading';
      }
    } else if (activeEvent) {
      badgeText = activeEvent.toUpperCase();
      badgeClass = activeEvent;
      stageName = activeEvent;
    }

    // Move the traveling indicator dot on the green wave!
    const pos = STAGE_POSITIONS[stageName] || STAGE_POSITIONS.thinking;
    if (runObj.waveDotEl) {
      runObj.waveDotEl.style.left = pos.left;
      runObj.waveDotEl.style.top = pos.top;
      runObj.waveDotEl.classList.toggle('error-state', stageName === 'task_error');
    }

    // Highlight active stage label along the wave
    if (runObj.stageLabels) {
      const activeKey = pos.label || stageName;
      Object.entries(runObj.stageLabels).forEach(([stg, el]) => {
        if (el) el.classList.toggle('active', stg === activeKey);
      });
    }

    if (runObj.metricsEls) {
      runObj.statusBadgeText = badgeText;
      if (runObj.metricsEls.statusBadge) {
        runObj.metricsEls.statusBadge.textContent = badgeText;
        runObj.metricsEls.statusBadge.className = `run-status-badge ${badgeClass}`;
      }
      if (runObj.metricsEls.summaryBadge) {
        runObj.metricsEls.summaryBadge.textContent = badgeText;
        runObj.metricsEls.summaryBadge.className = `run-status-badge ${badgeClass}`;
      }
    }
  }



  // Handle Log Filters
  if (filterPillsContainer) {
    filterPillsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      filterPillsContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter || 'all';
      applyLogFilters();
    });
  }

  if (btnRegexToggle) {
    btnRegexToggle.addEventListener('click', () => {
      isRegexMode = !isRegexMode;
      btnRegexToggle.classList.toggle('active', isRegexMode);
      applyLogFilters();
    });
  }

  if (logSearchInput) {
    logSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyLogFilters();
    });
  }

  if (autoscrollToggleBtn) {
    autoscrollToggleBtn.addEventListener('click', () => {
      isAutoscroll = !isAutoscroll;
      autoscrollToggleBtn.classList.toggle('active', isAutoscroll);
    });
  }

  function applyLogFilters() {
    const rows = consoleFeed.querySelectorAll('.console-row');
    let visibleCount = 0;
    let regex = null;

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      try {
        regex = isRegexMode ? new RegExp(trimmedQuery, 'i') : null;
      } catch (err) {
        regex = null;
      }
    }

    rows.forEach(row => {
      const eventType = row.dataset.eventType || '';
      const rowRunId = row.dataset.runId || '';
      const rowClassList = Array.from(row.classList);
      const text = row.textContent.toLowerCase();
      const queryLower = trimmedQuery.toLowerCase();

      // Scoped Run Filtering (when a specific CLI tab is active)
      let runMatch = (activeTabRunId === 'all' || rowRunId === activeTabRunId || eventType === 'system-msg');

      let categoryMatch = (currentFilter === 'all');
      if (!categoryMatch) {
        if (currentFilter === 'thinking' && (eventType === 'thinking' || eventType === 'planning')) categoryMatch = true;
        if (currentFilter === 'executing_tool' && (eventType === 'executing_tool')) categoryMatch = true;
        if (currentFilter === 'mcp' && (eventType === 'mcp' || text.includes('mcp'))) categoryMatch = true;
        if (currentFilter === 'terminal' && (eventType === 'terminal' || text.includes('run command') || text.includes('executing terminal command'))) categoryMatch = true;
        if (currentFilter === 'task_error' && (eventType.includes('error') || rowClassList.includes('task_error'))) categoryMatch = true;
      }

      let searchMatch = true;
      if (trimmedQuery) {
        searchMatch = regex ? regex.test(row.textContent) : text.includes(queryLower);
      }

      if (runMatch && categoryMatch && searchMatch) {
        row.classList.remove('hidden');
        visibleCount++;
      } else {
        row.classList.add('hidden');
      }
    });

    if (logCountBadge) {
      logCountBadge.textContent = `${visibleCount} Event${visibleCount !== 1 ? 's' : ''}`;
    }
  }

  audioToggle.addEventListener('click', () => {
    const iconEl = audioToggle.querySelector('.icon');
    const labelEl = audioToggle.querySelector('.audio-label-text');
    if (audioEngine.muted) {
      audioEngine.setMuted(false);
      if (iconEl) iconEl.textContent = '🔊';
      if (labelEl) labelEl.textContent = 'Audio Enabled';
      audioToggle.classList.add('active');
      audioToggle.classList.remove('muted');
      appendSystemMessage('Audio telemetry synthesizer activated.');
    } else {
      audioEngine.setMuted(true);
      if (iconEl) iconEl.textContent = '🔇';
      if (labelEl) labelEl.textContent = 'Enable Audio';
      audioToggle.classList.remove('active');
      audioToggle.classList.add('muted');
      appendSystemMessage('Audio telemetry muted.');
    }
  });

  if (clearConsoleBtn) {
    clearConsoleBtn.addEventListener('click', () => {
      consoleFeed.innerHTML = '';
      appendSystemMessage('Console cleared.');
    });
  }

  // Connect to Bridge WebSocket Server
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = (window.location.port === '5173' || !window.location.port) 
      ? `${window.location.hostname}:3000` 
      : window.location.host;
    const wsUrl = `${protocol}//${host}/stream`;
    
    setConnectionState('connecting', 'Connecting...');
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnectionState('connected', 'Connected');
      reconnectDelay = 2000;
      appendSystemMessage('Established real-time multi-run stream link.');
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'reset_all') {
          resetAllClientState();
        } else if (payload.type === 'init_runs' && Array.isArray(payload.runs)) {
          payload.runs.forEach(r => {
            getOrCreateRunUI(r.run_id, r.run_name, r.color);
            if (Array.isArray(r.recentEvents) && r.recentEvents.length > 0) {
              r.recentEvents.forEach(evt => handleTelemetryEvent(evt, true));
            }
          });
        } else {
          handleTelemetryEvent(payload);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      setConnectionState('disconnected', 'Disconnected');
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  function scheduleReconnect() {
    appendSystemMessage(`Link interrupted. Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 16000);
      connect();
    }, reconnectDelay);
  }

  function setConnectionState(state, text) {
    connectionBadge.className = `connection-status ${state}`;
    connectionBadge.textContent = text;
  }

  // Main Event Handler for Incoming Telemetry Packets
  function handleTelemetryEvent(payload, isInitialReplay = false) {
    const { run_id, run_name, run_color, event, message, timestamp, metadata } = payload;
    const effectiveRunId = run_id || 'cli-main';
    const toolName = metadata ? metadata.tool_name : undefined;

    // Retrieve or instantiate run UI state
    const runObj = getOrCreateRunUI(effectiveRunId, run_name, run_color);

    // Save latest event state on runObj
    runObj.lastActiveEvent = event;
    runObj.lastToolName = toolName;

    // Track active file contexts per run
    if (metadata && metadata.tool_name) {
      if (metadata.tool_name === 'run_command' && message && message.startsWith('Executing terminal command:')) {
        runObj.lastRunningCommand = metadata.target || '';
      } else if (metadata.tool_name === 'view_file' && message && message.startsWith('Reading file:')) {
        runObj.lastReadingFile = metadata.target || '';
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content'].includes(metadata.tool_name) && message && message.startsWith('Writing changes to file:')) {
        runObj.lastEditingFile = metadata.target || '';
      }
    }

    const isError = (event === 'task_error') || (event === 'executing_tool' && isCommandFailure(message, metadata));

    // 1. Audio Synthesis Cue
    if (!isInitialReplay) {
      if (isError) {
        audioEngine.trigger('task_error');
      } else {
        audioEngine.trigger(event, toolName);
      }
    }

    // 2. Calculate Latency & Update Metrics
    const now = new Date();
    const eventTime = new Date(timestamp);
    const latency = Math.max(0, now - eventTime);
    runObj.lastLatency = latency;

    if (runObj.metricsEls.latency) runObj.metricsEls.latency.textContent = `${latency} ms`;
    if (runObj.metricsEls.summaryLatency) runObj.metricsEls.summaryLatency.textContent = `${latency} ms`;
    
    if (metadata) {
      if (metadata.tokens_per_sec !== undefined) {
        runObj.lastSpeed = metadata.tokens_per_sec;
        if (runObj.metricsEls.speed) runObj.metricsEls.speed.textContent = `${metadata.tokens_per_sec} t/s`;
        if (runObj.metricsEls.summarySpeed) runObj.metricsEls.summarySpeed.textContent = `${metadata.tokens_per_sec} t/s`;
      }
      if (metadata.context_pct !== undefined) {
        runObj.lastContext = metadata.context_pct;
        if (runObj.metricsEls.context) runObj.metricsEls.context.textContent = `${metadata.context_pct} %`;
        if (runObj.metricsEls.summaryContext) runObj.metricsEls.summaryContext.textContent = `${metadata.context_pct} %`;
      }
      if (metadata.is_exact && typeof metadata.input_tokens === 'number' && typeof metadata.output_tokens === 'number') {
        runObj.isExactTokens = true;
        runObj.inputTokens = metadata.input_tokens;
        runObj.outputTokens = metadata.output_tokens;
        runObj.cacheReadTokens = metadata.cache_read_tokens || 0;
        const tokenStr = formatTokenPair(metadata.input_tokens, metadata.output_tokens);
        runObj.lastTokensStr = tokenStr;
        if (runObj.metricsEls.cost) runObj.metricsEls.cost.textContent = tokenStr;
        if (runObj.metricsEls.summaryCost) runObj.metricsEls.summaryCost.textContent = tokenStr;
      } else if (metadata.is_exact === false) {
        runObj.isExactTokens = false;
        runObj.lastTokensStr = '-- in / -- out';
        if (runObj.metricsEls.cost) runObj.metricsEls.cost.textContent = '-- in / -- out';
        if (runObj.metricsEls.summaryCost) runObj.metricsEls.summaryCost.textContent = '-- in / -- out';
      }
    }

    // Persist runs state to localStorage for refresh retention
    persistRunsState();

    // Update single-view focus section if viewing Master Focus ('all') or specific CLI ('effectiveRunId')
    if (activeTabRunId === 'all') {
      computeMasterFocusMetrics();
    } else if (activeTabRunId === effectiveRunId) {
      if (metricLatency) metricLatency.textContent = `${latency} ms`;
      if (metadata) {
        if (metadata.tokens_per_sec !== undefined && metricSpeed) metricSpeed.textContent = `${metadata.tokens_per_sec} t/s`;
        if (metadata.context_pct !== undefined && metricContext) metricContext.textContent = `${metadata.context_pct} %`;
        if (metricCost) metricCost.textContent = runObj.lastTokensStr || '--';
      }
      updateSinglePipelineUI(isError ? 'task_error' : event, toolName);
    }



    // 3. Update Pipeline Nodes for this run's card
    updateRunPipelineUI(runObj, isError ? 'task_error' : event, toolName);

    // 4. Log to Dedicated Run Console Feed & Global Combined Feed
    appendEventToConsole(runObj, event, message, metadata, isError, timestamp);
  }

  function updateSinglePipelineUI(activeEvent, toolName) {
    let stageName = 'thinking';

    if (activeEvent === 'task_error') {
      stageName = 'task_error';
    } else if (activeEvent === 'executing_tool') {
      const lower = (toolName || '').toLowerCase();
      if (lower.includes('mcp') || lower.includes('stitch') || ['call_mcp_tool', 'create_project', 'generate_screen_from_text', 'edit_screens', 'todowrite', 'todoread'].includes(lower)) {
        stageName = 'mcp';
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content', 'code_action', 'write', 'edit', 'multiedit'].includes(lower) || lower.includes('write') || lower.includes('edit')) {
        stageName = 'writing';
      } else if (['run_command', 'bash', 'terminal', 'cmd'].includes(lower) || lower.includes('bash') || lower.includes('command')) {
        stageName = 'terminal';
      } else {
        stageName = 'reading';
      }
    } else if (activeEvent) {
      stageName = activeEvent;
    }

    const pos = STAGE_POSITIONS[stageName] || STAGE_POSITIONS.thinking;
    const singleDot = document.getElementById('single-wave-dot');
    if (singleDot) {
      singleDot.style.left = pos.left;
      singleDot.style.top = pos.top;
      singleDot.classList.toggle('error-state', stageName === 'task_error');
    }

    const stageKeys = ['thinking', 'planning', 'reading', 'writing', 'terminal', 'mcp', 'task_done'];
    const activeKey = pos.label || stageName;
    stageKeys.forEach(stg => {
      const el = document.getElementById(`single-stage-${stg}`);
      if (el) el.classList.toggle('active', stg === activeKey);
    });
  }

  function isCommandFailure(message, metadata) {
    if (!message) return false;
    if (metadata && metadata.target) {
      if (metadata.target.includes('Exit Code:') && !metadata.target.includes('Exit Code: 0')) {
        return true;
      }
    }
    if (/exit code [1-9]/i.test(message)) return true;
    if (/\b(Error:|Failed:|fatal:|Exception:|P[0-9]{4}:)/i.test(message) && !message.includes('No lint errors')) {
      return true;
    }
    return false;
  }

  function extractErrorSnippet(message) {
    if (!message) return 'Execution error';
    const lines = message.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      if (/^(Error:|Fatal:|Exception:|P[0-9]{4}:)/i.test(line)) {
        return line.length > 70 ? line.substring(0, 67) + '...' : line;
      }
    }
    if (lines.length > 0) {
      const last = lines[lines.length - 1];
      return last.length > 70 ? last.substring(0, 67) + '...' : last;
    }
    return 'Command failed';
  }

  function getEventSummary(event, message, metadata, runObj) {
    if (!message) return '';
    
    if (metadata) {
      if (metadata.tool_name === 'run_command') {
        if (message.startsWith('Executing terminal command:')) return message;
        const cmdName = runObj ? runObj.lastRunningCommand : (metadata.target || 'command');
        const isError = isCommandFailure(message, metadata);
        return isError ? `ran ${cmdName} (Failed: ${extractErrorSnippet(message)})` : `ran ${cmdName}`;
      }

      if (['code_action', 'replace_file_content', 'write_to_file', 'multi_replace_file_content'].includes(metadata.tool_name)) {
        if (message.startsWith('Writing changes to file:')) return message;

        const createdMatch = message.match(/Created file (?:file:\/\/\/)?([^\s\n\r]+)/i);
        if (createdMatch) {
          let rawPath = createdMatch[1].replace(/with$/, '').trim().replace(/\\/g, '/');
          return `Created file ${rawPath.split('/').pop()} at ${rawPath}`;
        }

        const modifiedMatch = message.match(/to:\s*(.+?)(?:\.\s*If relevant|\.[\r\n]|\.$|[\r\n]|$)/i);
        if (modifiedMatch) {
          let rawPath = modifiedMatch[1].trim().replace(/\\/g, '/');
          return `Modified file ${rawPath.split('/').pop()} at ${rawPath}`;
        }

        const fileName = metadata.target ? metadata.target.split('/').pop().split('\\').pop() : 'file';
        return `Modified file ${fileName}`;
      }

      if (metadata.tool_name === 'view_file') {
        if (message.startsWith('Reading file:')) return message;
        const fileName = metadata.target ? metadata.target.split('/').pop().split('\\').pop() : 'file';
        return `Read file content: ${fileName}`;
      }
    }

    if (message.includes(';') || message.includes('{') || message.includes('function') || message.includes('<!DOCTYPE') || message.includes('const ')) {
      return `Code block output`;
    }

    const lines = message.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      let firstLine = lines[0];
      return firstLine.length > 100 ? firstLine.substring(0, 97) + '...' : firstLine;
    }
    return 'Detailed output';
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatToolBadgeName(toolName) {
    if (!toolName) return '';
    const customMap = {
      'call_mcp_tool': 'Call MCP Tool',
      'list_dir': 'List Dir',
      'list_directory': 'List Directory',
      'run_command': 'Run Command',
      'view_file': 'View File',
      'write_to_file': 'Write File',
      'replace_file_content': 'Edit File',
      'multi_replace_file_content': 'Multi Edit',
      'grep_search': 'Grep Search',
      'search_web': 'Search Web',
      'generate_screen_from_text': 'Stitch Screen Gen'
    };
    return customMap[toolName] || toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Build and Append Console Row
  function appendEventToConsole(runObj, event, message, metadata, isError = false, timestampStr = null) {
    if (!message) return;

    if (runObj) {
      runObj.logs = runObj.logs || [];
      const lastLog = runObj.logs[runObj.logs.length - 1];
      if (!lastLog || lastLog.message !== message || lastLog.event !== event) {
        runObj.logs.push({ event, message, metadata, isError, timestamp: timestampStr });
        if (runObj.logs.length > 150) runObj.logs.shift();
      }
    }

    const isCollapsible = message && (message.includes('\n') || message.length > 120);

    const toolName = metadata ? metadata.tool_name : '';
    let categoryType = event;
    if (toolName && (toolName.startsWith('mcp_') || toolName.includes('mcp') || toolName.includes('stitch') || ['call_mcp_tool', 'create_project'].includes(toolName))) {
      categoryType = 'mcp';
    } else if (toolName === 'run_command') {
      categoryType = 'terminal';
    }

    // Function to construct row element
    const createRow = (includeRunBadge = false) => {
      const row = document.createElement('div');
      row.className = `console-row ${isError ? 'error-run task_error' : event}`;
      row.dataset.eventType = categoryType;
      row.dataset.runId = runObj ? runObj.run_id : '';
      if (isCollapsible) row.classList.add('collapsible', 'collapsed');

      let displayTime = new Date().toTimeString().split(' ')[0];
      if (timestampStr) {
        try {
          const tDate = new Date(timestampStr);
          if (!isNaN(tDate.getTime())) {
            displayTime = tDate.toTimeString().split(' ')[0];
          }
        } catch (e) {}
      }

      const timestampSpan = document.createElement('span');
      timestampSpan.className = 'timestamp';
      timestampSpan.textContent = `[${displayTime}]`;

      if (isCollapsible) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'console-row-summary';
        summaryDiv.appendChild(timestampSpan);

        if (includeRunBadge && runObj) {
          const runBadge = document.createElement('span');
          runBadge.className = 'badge badge-run';
          runBadge.style.borderColor = runObj.color;
          runBadge.style.color = runObj.color;
          runBadge.textContent = runObj.run_name;
          summaryDiv.appendChild(runBadge);
        }

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'collapse-toggle-btn';
        toggleBtn.innerHTML = '<span class="toggle-arrow">▶</span>';
        summaryDiv.appendChild(toggleBtn);

        const summarySpan = document.createElement('span');
        summarySpan.className = 'message summary-text';
        
        const summaryText = getEventSummary(event, message, metadata, runObj);
        let htmlContent = escapeHtml(summaryText);

        if (metadata) {
          if (metadata.tool_name) htmlContent = `<span class="badge badge-tool">${escapeHtml(formatToolBadgeName(metadata.tool_name))}</span> ` + htmlContent;
          if (metadata.target) htmlContent += ` <span class="badge badge-target">${escapeHtml(metadata.target)}</span>`;
        }
        summarySpan.innerHTML = htmlContent;
        summaryDiv.appendChild(summarySpan);
        row.appendChild(summaryDiv);

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'console-row-details';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = message;
        pre.appendChild(code);
        detailsDiv.appendChild(pre);
        row.appendChild(detailsDiv);

        summaryDiv.addEventListener('click', () => {
          if (window.getSelection().toString()) return;
          row.classList.toggle('expanded');
          row.classList.toggle('collapsed');
        });
      } else {
        row.appendChild(timestampSpan);

        if (includeRunBadge && runObj) {
          const runBadge = document.createElement('span');
          runBadge.className = 'badge badge-run';
          runBadge.style.borderColor = runObj.color;
          runBadge.style.color = runObj.color;
          runBadge.textContent = runObj.run_name;
          row.appendChild(runBadge);
        }

        const placeholder = document.createElement('span');
        placeholder.className = 'collapse-toggle-placeholder';
        row.appendChild(placeholder);

        const messageSpan = document.createElement('span');
        messageSpan.className = 'message';
        let htmlContent = escapeHtml(message);

        if (metadata) {
          if (metadata.tool_name) htmlContent = `<span class="badge badge-tool">${escapeHtml(formatToolBadgeName(metadata.tool_name))}</span> ` + htmlContent;
          if (metadata.target) htmlContent += ` <span class="badge badge-target">${escapeHtml(metadata.target)}</span>`;
        }
        messageSpan.innerHTML = htmlContent;
        row.appendChild(messageSpan);
      }

      return row;
    };

    // 1. Append to Scoped Run Console Viewport
    if (runObj && runObj.consoleEl) {
      const runRow = createRow(false);
      runObj.consoleEl.appendChild(runRow);
      runObj.consoleEl.scrollTop = runObj.consoleEl.scrollHeight;
    }

    // 2. Append to Single View / Global Console Viewport
    if (consoleFeed) {
      const globalRow = createRow(true);
      consoleFeed.appendChild(globalRow);
      applyLogFilters();
      if (isAutoscroll) consoleFeed.scrollTop = consoleFeed.scrollHeight;
    }
  }


  function appendSystemMessage(msg) {
    if (consoleFeed) {
      const row = document.createElement('div');
      row.className = 'console-row system-msg';
      row.innerHTML = `<span class="timestamp">[${new Date().toTimeString().split(' ')[0]}]</span> <span class="message">${escapeHtml(msg)}</span>`;
      consoleFeed.appendChild(row);
    }
  }

  // Restore saved active CLI tabs from localStorage
  restoreRunsState();
  updateTabFocus();

  // Start WebSockets
  connect();
});


