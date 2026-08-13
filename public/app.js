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

  const allRunsSubviewToggle = document.getElementById('all-runs-subview-toggle');
  const btnAllRunsParallel = document.getElementById('btn-allruns-parallel');
  const btnAllRunsFocus = document.getElementById('btn-allruns-focus');

  // DOM Elements - Single View Fallback Controls
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
  let allRunsSubviewMode = 'parallel'; // 'parallel' (default) | 'focus'
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

  // --- All Runs Sub-View Toggle (Side-by-Side Parallel vs Master Focus) ---
  if (btnAllRunsParallel && btnAllRunsFocus) {
    btnAllRunsParallel.addEventListener('click', () => {
      allRunsSubviewMode = 'parallel';
      btnAllRunsParallel.classList.add('active');
      btnAllRunsFocus.classList.remove('active');
      updateTabFocus();
    });

    btnAllRunsFocus.addEventListener('click', () => {
      allRunsSubviewMode = 'focus';
      btnAllRunsFocus.classList.add('active');
      btnAllRunsParallel.classList.remove('active');
      updateTabFocus();
    });
  }

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

  function computeMasterFocusMetrics() {
    const runs = Object.values(runsStore);
    if (runs.length === 0) return;

    let sumLatency = 0, countLatency = 0;
    let sumSpeed = 0, countSpeed = 0;
    let sumContext = 0, countContext = 0;
    let sumCost = 0;

    runs.forEach(run => {
      if (typeof run.lastLatency === 'number') { sumLatency += run.lastLatency; countLatency++; }
      if (typeof run.lastSpeed === 'number') { sumSpeed += run.lastSpeed; countSpeed++; }
      if (typeof run.lastContext === 'number') { sumContext += run.lastContext; countContext++; }
      if (typeof run.lastCost === 'number') { sumCost += run.lastCost; }
    });

    const avgLatency = countLatency > 0 ? Math.round(sumLatency / countLatency) : 0;
    const avgSpeed = countSpeed > 0 ? Math.round(sumSpeed / countSpeed) : 0;
    const avgContext = countContext > 0 ? (Math.round((sumContext / countContext) * 10) / 10) : 0;

    if (metricLatency) metricLatency.textContent = `${avgLatency} ms`;
    if (metricSpeed) metricSpeed.textContent = `${avgSpeed} t/s`;
    if (metricContext) metricContext.textContent = `${avgContext} %`;
    if (metricCost) metricCost.textContent = `~$ ${sumCost.toFixed(4)}`;

    if (badgeSpeed) { badgeSpeed.className = 'metric-badge avg'; badgeSpeed.textContent = 'AVG SPEED'; }
    if (badgeContext) { badgeContext.className = 'metric-badge avg'; badgeContext.textContent = 'AVG CONTEXT'; }
    if (badgeCost) { badgeCost.className = 'metric-badge total'; badgeCost.textContent = 'TOTAL COST'; }
  }

  function updateTabFocus() {
    if (activeTabRunId === 'all') {
      singleFocusSection.classList.remove('individual-run-mode');
      
      // Show All Runs subview toggle
      if (allRunsSubviewToggle) allRunsSubviewToggle.classList.remove('hidden');

      if (allRunsSubviewMode === 'parallel') {
        // Parallel View: 2-Column Side-by-Side Grid
        multiRunContainer.className = 'multi-run-grid parallel-mode';
        singleFocusSection.classList.add('hidden');
        Object.values(runsStore).forEach(run => {
          if (run.cardEl) run.cardEl.classList.remove('hidden');
        });
      } else {
        // Master Focus View: Master Combined Feed & Pipeline with Averaged / Summed Metrics
        multiRunContainer.className = 'multi-run-grid hidden';
        singleFocusSection.classList.remove('hidden');
        computeMasterFocusMetrics();
        applyLogFilters();
      }
    } else {
      // Specific CLI tab selected (e.g., 'cli-backend' or 'conv-e53b43b2')
      singleFocusSection.classList.add('individual-run-mode');

      // Hide All Runs subview toggle
      if (allRunsSubviewToggle) allRunsSubviewToggle.classList.add('hidden');

      // Display Full Focus View (matching image copy 3.png) for this specific CLI
      multiRunContainer.className = 'multi-run-grid hidden';
      singleFocusSection.classList.remove('hidden');

      // Reset badges to Live / Real-Time for single run
      if (badgeSpeed) { badgeSpeed.className = 'metric-badge live'; badgeSpeed.textContent = 'LIVE'; }
      if (badgeContext) { badgeContext.className = 'metric-badge live'; badgeContext.textContent = 'LIVE'; }
      if (badgeCost) { badgeCost.className = 'metric-badge estimated'; badgeCost.textContent = 'EST. COST'; }

      // Populate Focus View Metrics & Pipeline Map with this specific CLI's state
      const targetRun = runsStore[activeTabRunId];
      if (targetRun) {
        if (metricLatency) metricLatency.textContent = targetRun.metricsEls.latency ? targetRun.metricsEls.latency.textContent : '-- ms';
        if (metricSpeed) metricSpeed.textContent = targetRun.metricsEls.speed ? targetRun.metricsEls.speed.textContent : '-- t/s';
        if (metricContext) metricContext.textContent = targetRun.metricsEls.context ? targetRun.metricsEls.context.textContent : '-- %';
        if (metricCost) metricCost.textContent = targetRun.metricsEls.cost ? targetRun.metricsEls.cost.textContent : '~$0.0000';
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

    // 2. Create Split Card Column in Multi-Run Grid
    const cardEl = document.createElement('div');
    cardEl.className = 'run-card';
    cardEl.id = `run-card-${runId}`;

    cardEl.innerHTML = `
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
          <span class="run-metric-label">COST</span>
          <span class="run-metric-val metric-run-cost">~$0.0000</span>
        </div>
      </div>

      <div class="run-pipeline-container">
        <div class="run-pipeline-flow">
          <div class="pipeline-node node-run-thinking">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">Thought</div>
          </div>
          <div class="flow-arrow"></div>
          <div class="pipeline-node node-run-planning">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">Planning</div>
          </div>
          <div class="flow-arrow"></div>
          <div class="pipeline-node node-run-reading">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">Reading</div>
          </div>
          <div class="flow-arrow"></div>
          <div class="pipeline-node node-run-writing">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">Writing</div>
          </div>
          <div class="flow-arrow"></div>
          <div class="pipeline-node node-run-terminal">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">Terminal</div>
          </div>
          <div class="flow-arrow"></div>
          <div class="pipeline-node node-run-mcp">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">MCP</div>
          </div>
          <div class="flow-arrow"></div>
          <div class="pipeline-node node-run-task_done">
            <div class="indicator-ring"><div class="indicator-dot"></div></div>
            <div class="node-label">Done</div>
          </div>
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
    const nodes = {
      thinking: cardEl.querySelector('.node-run-thinking'),
      planning: cardEl.querySelector('.node-run-planning'),
      reading: cardEl.querySelector('.node-run-reading'),
      writing: cardEl.querySelector('.node-run-writing'),
      terminal: cardEl.querySelector('.node-run-terminal'),
      mcp: cardEl.querySelector('.node-run-mcp'),
      task_done: cardEl.querySelector('.node-run-task_done')
    };

    const metricsEls = {
      latency: cardEl.querySelector('.metric-run-latency'),
      speed: cardEl.querySelector('.metric-run-speed'),
      context: cardEl.querySelector('.metric-run-context'),
      cost: cardEl.querySelector('.metric-run-cost'),
      statusBadge: cardEl.querySelector('.run-status-badge')
    };

    const consoleEl = cardEl.querySelector(`#run-console-${runId}`);

    runsStore[runId] = {
      run_id: runId,
      run_name: name,
      color: color,
      cardEl,
      tabEl,
      nodes,
      metricsEls,
      consoleEl,
      lastRunningCommand: '',
      lastReadingFile: '',
      lastEditingFile: ''
    };

    updateActiveRunsCount();
    return runsStore[runId];
  }

  function updateActiveRunsCount() {
    const count = Object.keys(runsStore).length;
    if (activeRunsCountBadge) {
      activeRunsCountBadge.textContent = `${count} Active Run${count !== 1 ? 's' : ''}`;
    }
  }

  // Updates pipeline nodes for a specific run
  function updateRunPipelineUI(runObj, activeEvent, toolName) {
    if (!runObj || !runObj.nodes) return;

    Object.values(runObj.nodes).forEach(node => {
      if (node) node.classList.remove('active', 'error');
    });

    if (activeEvent === 'task_error') {
      Object.values(runObj.nodes).forEach(node => {
        if (node) node.classList.add('error');
      });
      if (runObj.metricsEls.statusBadge) {
        runObj.metricsEls.statusBadge.textContent = 'ERROR';
        runObj.metricsEls.statusBadge.className = 'run-status-badge task_error';
      }
    } else if (activeEvent === 'executing_tool') {
      let activeNodeName = 'reading';
      if (toolName && (toolName.startsWith('mcp_') || toolName.includes('mcp') || toolName.includes('stitch') || ['call_mcp_tool', 'create_project', 'generate_screen_from_text', 'edit_screens'].includes(toolName))) {
        activeNodeName = 'mcp';
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content', 'code_action'].includes(toolName)) {
        activeNodeName = 'writing';
      } else if (toolName === 'run_command') {
        activeNodeName = 'terminal';
      }

      if (runObj.nodes[activeNodeName]) runObj.nodes[activeNodeName].classList.add('active');
      if (runObj.metricsEls.statusBadge) {
        runObj.metricsEls.statusBadge.textContent = toolName ? formatToolBadgeName(toolName) : 'EXECUTING';
        runObj.metricsEls.statusBadge.className = 'run-status-badge executing_tool';
      }
    } else if (runObj.nodes[activeEvent]) {
      runObj.nodes[activeEvent].classList.add('active');
      if (runObj.metricsEls.statusBadge) {
        runObj.metricsEls.statusBadge.textContent = activeEvent.toUpperCase();
        runObj.metricsEls.statusBadge.className = `run-status-badge ${activeEvent}`;
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
    if (audioEngine.muted) {
      audioEngine.setMuted(false);
      audioToggle.textContent = '🔊 Audio Enabled';
      audioToggle.classList.add('active');
      audioToggle.classList.remove('muted');
      appendSystemMessage('Audio telemetry synthesizer activated.');
    } else {
      audioEngine.setMuted(true);
      audioToggle.textContent = '🔇 Enable Audio';
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
    const wsUrl = `${protocol}//${window.location.host}/stream`;
    
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
        if (payload.type === 'init_runs' && Array.isArray(payload.runs)) {
          payload.runs.forEach(r => getOrCreateRunUI(r.run_id, r.run_name, r.color));
        } else {
          handleTelemetryEvent(payload);
        }
      } catch (err) {
        console.error('Error parsing telemetry payload:', err);
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
  function handleTelemetryEvent(payload) {
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
    if (isError) {
      audioEngine.trigger('task_error');
    } else {
      audioEngine.trigger(event, toolName);
    }

    // 2. Calculate Latency & Update Metrics
    const now = new Date();
    const eventTime = new Date(timestamp);
    const latency = Math.max(0, now - eventTime);
    runObj.lastLatency = latency;

    if (runObj.metricsEls.latency) runObj.metricsEls.latency.textContent = `${latency} ms`;
    
    if (metadata) {
      if (metadata.tokens_per_sec !== undefined) {
        runObj.lastSpeed = metadata.tokens_per_sec;
        if (runObj.metricsEls.speed) runObj.metricsEls.speed.textContent = `${metadata.tokens_per_sec} t/s`;
      }
      if (metadata.context_pct !== undefined) {
        runObj.lastContext = metadata.context_pct;
        if (runObj.metricsEls.context) runObj.metricsEls.context.textContent = `${metadata.context_pct} %`;
      }
      if (metadata.estimated_cost !== undefined) {
        const parsedCost = parseFloat(metadata.estimated_cost.replace(/[^0-9.]/g, ''));
        if (!isNaN(parsedCost)) runObj.lastCost = parsedCost;
        if (runObj.metricsEls.cost) runObj.metricsEls.cost.textContent = metadata.estimated_cost;
      }
    }

    // Update single-view focus section if viewing Master Focus ('all') or specific CLI ('effectiveRunId')
    if (activeTabRunId === 'all' && allRunsSubviewMode === 'focus') {
      computeMasterFocusMetrics();
      updateSinglePipelineUI(isError ? 'task_error' : event, toolName);
    } else if (activeTabRunId === effectiveRunId) {
      if (metricLatency) metricLatency.textContent = `${latency} ms`;
      if (metadata) {
        if (metadata.tokens_per_sec !== undefined && metricSpeed) metricSpeed.textContent = `${metadata.tokens_per_sec} t/s`;
        if (metadata.context_pct !== undefined && metricContext) metricContext.textContent = `${metadata.context_pct} %`;
        if (metadata.estimated_cost !== undefined && metricCost) metricCost.textContent = metadata.estimated_cost;
      }
      updateSinglePipelineUI(isError ? 'task_error' : event, toolName);
    }


    // 3. Update Pipeline Nodes for this run's card
    updateRunPipelineUI(runObj, isError ? 'task_error' : event, toolName);

    // 4. Log to Dedicated Run Console Feed & Global Combined Feed
    appendEventToConsole(runObj, event, message, metadata, isError);
  }

  function updateSinglePipelineUI(activeEvent, toolName) {
    Object.values(singleNodes).forEach(node => {
      if (node) node.classList.remove('active', 'error');
    });

    if (activeEvent === 'task_error') {
      Object.values(singleNodes).forEach(node => {
        if (node) node.classList.add('error');
      });
    } else if (activeEvent === 'executing_tool') {
      if (toolName && (toolName.startsWith('mcp_') || toolName.includes('mcp') || toolName.includes('stitch') || ['call_mcp_tool', 'create_project', 'generate_screen_from_text'].includes(toolName))) {
        if (singleNodes.mcp) singleNodes.mcp.classList.add('active');
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content'].includes(toolName)) {
        if (singleNodes.writing) singleNodes.writing.classList.add('active');
      } else if (toolName === 'run_command') {
        if (singleNodes.terminal) singleNodes.terminal.classList.add('active');
      } else {
        if (singleNodes.reading) singleNodes.reading.classList.add('active');
      }
    } else if (singleNodes[activeEvent]) {
      singleNodes[activeEvent].classList.add('active');
    }
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
  function appendEventToConsole(runObj, event, message, metadata, isError = false) {
    if (!message) return;

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

      const timestampSpan = document.createElement('span');
      timestampSpan.className = 'timestamp';
      timestampSpan.textContent = `[${new Date().toTimeString().split(' ')[0]}]`;

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

  // Start WebSockets
  connect();
});

