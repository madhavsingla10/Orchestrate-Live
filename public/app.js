/**
 * OrchestrateLive Core App Coordinator
 * Coordinates WebSockets, UI elements, and Audio synthesis.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Web Audio engine instance
  const audioEngine = new window.AudioTelemetryEngine();
  
  // DOM Elements
  const audioToggle = document.getElementById('audio-toggle');
  const connectionBadge = document.getElementById('connection-badge');
  const consoleFeed = document.getElementById('console-feed');
  const clearConsoleBtn = document.getElementById('clear-console-btn');
  
  const metricLatency = document.getElementById('metric-latency');
  const metricSpeed = document.getElementById('metric-speed');
  const metricContext = document.getElementById('metric-context');
  
  const nodes = {
    thinking: document.getElementById('node-thinking'),
    planning: document.getElementById('node-planning'),
    executing_tool: document.getElementById('node-executing_tool'),
    task_done: document.getElementById('node-task_done')
  };

  // State
  let reconnectDelay = 2000;
  let socket = null;

  // Set up audio activation listener (Autoplay bypass)
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

  // Clear Console logs
  clearConsoleBtn.addEventListener('click', () => {
    consoleFeed.innerHTML = '';
    appendSystemMessage('Console cleared.');
  });

  // Connect to Bridge WS Server
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/stream`;
    
    setConnectionState('connecting', 'Connecting...');
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnectionState('connected', 'Connected');
      reconnectDelay = 2000; // Reset delay
      appendSystemMessage('Established real-time stream link.');
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleTelemetryEvent(payload);
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

  // Schedule reconnect with exponential backoff
  function scheduleReconnect() {
    appendSystemMessage(`Link interrupted. Attempting reconnect in ${reconnectDelay / 1000}s...`);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 16000);
      connect();
    }, reconnectDelay);
  }

  // Update connection indicator
  function setConnectionState(state, text) {
    connectionBadge.className = `connection-status ${state}`;
    connectionBadge.textContent = text;
  }

  // Triggered when a telemetry packet is received
  function handleTelemetryEvent(payload) {
    const { event, message, timestamp, metadata } = payload;

    // 1. Play audio synthesis cue
    audioEngine.trigger(event);

    // 2. Compute telemetry stats
    const now = new Date();
    const eventTime = new Date(timestamp);
    const latency = Math.max(0, now - eventTime);
    
    metricLatency.textContent = `${latency} ms`;
    
    if (metadata) {
      if (metadata.tokens_per_sec !== undefined) {
        metricSpeed.textContent = `${metadata.tokens_per_sec} t/s`;
      }
      if (metadata.context_pct !== undefined) {
        metricContext.textContent = `${metadata.context_pct} %`;
      }
    }

    // 3. Update Pipeline Nodes
    updatePipelineUI(event);

    // 4. Log to Console Feed
    appendEventToConsole(event, message, metadata);
  }

  // Updates pipeline active/error classes
  function updatePipelineUI(activeEvent) {
    // Clear previous state classes
    Object.values(nodes).forEach(node => {
      node.classList.remove('active', 'error');
    });

    if (activeEvent === 'task_error') {
      // Light up all nodes in ruby error mode
      Object.values(nodes).forEach(node => {
        node.classList.add('error');
      });
    } else if (nodes[activeEvent]) {
      nodes[activeEvent].classList.add('active');
    }
  }

  // Formats and appends console logs
  function appendEventToConsole(event, message, metadata) {
    const row = document.createElement('div');
    row.className = `console-row ${event}`;

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = `[${new Date().toTimeString().split(' ')[0]}]`;
    row.appendChild(timestampSpan);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'message';
    
    let htmlContent = message;

    // Attach metadata badges if present
    if (metadata) {
      if (metadata.tool_name) {
        htmlContent = `<span class="badge badge-tool">${metadata.tool_name}</span> ` + htmlContent;
      }
      if (metadata.target) {
        htmlContent += ` <span class="badge badge-target">${metadata.target}</span>`;
      }
    }

    messageSpan.innerHTML = htmlContent;
    row.appendChild(messageSpan);

    consoleFeed.appendChild(row);
    consoleFeed.scrollTop = consoleFeed.scrollHeight;
  }

  // System diagnostic console logging
  function appendSystemMessage(msg) {
    appendEventToConsole('system-msg', msg, null);
  }

  // Kickstart WebSockets
  connect();
});
