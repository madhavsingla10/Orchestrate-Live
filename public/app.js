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
    reading: document.getElementById('node-reading'),
    writing: document.getElementById('node-writing'),
    terminal: document.getElementById('node-terminal'),
    task_done: document.getElementById('node-task_done')
  };

  // State
  let reconnectDelay = 2000;
  let socket = null;
  let lastRunningCommand = '';
  let lastReadingFile = '';
  let lastEditingFile = '';

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
    const toolName = metadata ? metadata.tool_name : undefined;

    // Track active command / file contexts
    if (metadata && metadata.tool_name) {
      if (metadata.tool_name === 'run_command' && message && message.startsWith('Executing terminal command:')) {
        lastRunningCommand = metadata.target || '';
      } else if (metadata.tool_name === 'view_file' && message && message.startsWith('Reading file:')) {
        lastReadingFile = metadata.target || '';
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content'].includes(metadata.tool_name) && message && message.startsWith('Writing changes to file:')) {
        lastEditingFile = metadata.target || '';
      }
    }

    // Check if tool output represents a failure
    const isError = (event === 'task_error') || (event === 'executing_tool' && isCommandFailure(message, metadata));

    // 1. Play audio synthesis cue
    if (isError) {
      audioEngine.trigger('task_error');
    } else {
      audioEngine.trigger(event, toolName);
    }

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
    updatePipelineUI(isError ? 'task_error' : event, toolName);

    // 4. Log to Console Feed
    appendEventToConsole(event, message, metadata, isError);
  }

  // Updates pipeline active/error classes
  function updatePipelineUI(activeEvent, toolName) {
    // Clear previous state classes
    Object.values(nodes).forEach(node => {
      if (node) node.classList.remove('active', 'error');
    });

    if (activeEvent === 'task_error') {
      // Light up all nodes in ruby error mode
      Object.values(nodes).forEach(node => {
        if (node) node.classList.add('error');
      });
    } else if (activeEvent === 'executing_tool') {
      // Differentiate tool execution into Reading, Writing, and Terminal nodes
      if (['view_file', 'list_dir', 'list_directory', 'grep_search', 'search_web', 'read_url_content'].includes(toolName)) {
        if (nodes.reading) nodes.reading.classList.add('active');
      } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content', 'code_action'].includes(toolName)) {
        if (nodes.writing) nodes.writing.classList.add('active');
      } else if (toolName === 'run_command') {
        if (nodes.terminal) nodes.terminal.classList.add('active');
      } else {
        if (nodes.reading) nodes.reading.classList.add('active');
      }
    } else if (nodes[activeEvent]) {
      nodes[activeEvent].classList.add('active');
    }
  }

  // Checks if a command output contains an error
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

  // Extracts error snippet for concise summaries
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

  // Helper to extract a concise, user-friendly summary of a tool command output or file action
  // Helper to extract a concise, user-friendly summary of a tool command output or file action
  function getEventSummary(event, message, metadata) {
    if (!message) return '';
    
    if (metadata) {
      // 1. Terminal Command Execution
      if (metadata.tool_name === 'run_command') {
        if (message.startsWith('Executing terminal command:')) {
          return message;
        }
        const cmdName = lastRunningCommand || metadata.target || 'command';
        const isError = isCommandFailure(message, metadata);
        if (isError) {
          const errorSnippet = extractErrorSnippet(message);
          return `ran ${cmdName} (Failed: ${errorSnippet})`;
        }
        return `ran ${cmdName}`;
      }

      // 2. Code Action & File Modifications
      if (['code_action', 'replace_file_content', 'write_to_file', 'multi_replace_file_content'].includes(metadata.tool_name)) {
        if (message.startsWith('Writing changes to file:') || message.startsWith('Modifying flex layout')) {
          return message;
        }

        // Match "Created file file:///..." or "Created file C:/..."
        const createdMatch = message.match(/Created file (?:file:\/\/\/)?([^\s\n\r]+)/i);
        if (createdMatch) {
          let rawPath = createdMatch[1].replace(/with$/, '').trim();
          rawPath = rawPath.replace(/\\/g, '/');
          const basename = rawPath.split('/').pop();
          return `Created file ${basename} at ${rawPath}`;
        }

        // Match "The following changes were made by ... to: C:\path\file"
        const modifiedMatch = message.match(/to:\s*(.+?)(?:\.\s*If relevant|\.[\r\n]|\.$|[\r\n]|$)/i);
        if (modifiedMatch) {
          let rawPath = modifiedMatch[1].trim();
          rawPath = rawPath.replace(/\\/g, '/');
          const basename = rawPath.split('/').pop();
          return `Modified file ${basename} at ${rawPath}`;
        }

        // Match git diff headers or code snippets
        if (message.startsWith('---') || message.startsWith('+++') || message.includes('[diff_block_start]')) {
          const fileMatch = message.match(/\+\+\+\s+([^\s\n\r]+)/);
          const targetFile = fileMatch ? fileMatch[1] : (lastEditingFile || 'file');
          const basename = targetFile.split('/').pop().split('\\').pop();
          const fullPath = lastEditingFile || targetFile;
          return `Modified file ${basename} at ${fullPath}`;
        }

        const fileName = metadata.target ? metadata.target.split('/').pop().split('\\').pop() : (lastEditingFile ? lastEditingFile.split('/').pop().split('\\').pop() : 'file');
        const fullPath = metadata.target || lastEditingFile || fileName;
        return `Modified file ${fileName} at ${fullPath}`;
      }

      // 3. Reading File Contents
      if (metadata.tool_name === 'view_file') {
        if (message.startsWith('Reading file:')) {
          return message;
        }
        const fileName = metadata.target ? metadata.target.split('/').pop().split('\\').pop() : (lastReadingFile ? lastReadingFile.split('/').pop().split('\\').pop() : 'file');
        const fullPath = metadata.target || lastReadingFile || fileName;
        return `Read file content: ${fileName} at ${fullPath}`;
      }

      // 4. Directory Listing
      if (metadata.tool_name === 'list_directory' || metadata.tool_name === 'list_dir') {
        if (message.startsWith('Listing files in directory:')) {
          return message;
        }
        const dirName = metadata.target ? metadata.target.split('/').pop().split('\\').pop() : 'directory';
        return `Listed directory: ${dirName}`;
      }

      // 5. Grep Search
      if (metadata.tool_name === 'grep_search') {
        if (message.startsWith('Searching pattern')) {
          return message;
        }
        return `Search matches in workspace`;
      }
    }

    // Default fallback: If message looks like code or diff, NEVER display raw code as the summary
    if (message.includes(';') || message.includes('{') || message.includes('function') || message.includes('class') || message.includes('<!DOCTYPE') || message.includes('import ') || message.includes('const ') || message.includes('let ') || message.includes('[diff_block_start]')) {
      const fileName = lastEditingFile ? lastEditingFile.split('/').pop().split('\\').pop() : 'code';
      return `Code block: ${fileName}`;
    }

    // Default fallback: extract the first non-empty line of the message
    const lines = message.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      let firstLine = lines[0];
      if (firstLine.length > 100) {
        firstLine = firstLine.substring(0, 97) + '...';
      }
      return firstLine;
    }
    return 'Detailed tool output';
  }

  // Simple HTML escaping helper to prevent script or layout injection in console
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let lastLoggedEvent = '';
  let lastLoggedMessage = '';

  // Formats and appends console logs
  function appendEventToConsole(event, message, metadata, isError = false) {
    if (!message) return;

    // Deduplicate consecutive identical task_done and system-msg logs
    if (['task_done', 'system-msg'].includes(event) && event === lastLoggedEvent && message === lastLoggedMessage) {
      return;
    }
    lastLoggedEvent = event;
    lastLoggedMessage = message;

    const isCollapsible = message && (message.includes('\n') || message.length > 120);

    const row = document.createElement('div');
    row.className = `console-row ${isError ? 'error-run task_error' : event}`;
    if (isCollapsible) {
      row.classList.add('collapsible', 'collapsed');
    }

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = `[${new Date().toTimeString().split(' ')[0]}]`;

    if (isCollapsible) {
      // Create horizontal summary container
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'console-row-summary';
      
      // Append timestamp to summary container
      summaryDiv.appendChild(timestampSpan);

      // Toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'collapse-toggle-btn';
      toggleBtn.innerHTML = '<span class="toggle-arrow">▶</span>';
      summaryDiv.appendChild(toggleBtn);

      const summarySpan = document.createElement('span');
      summarySpan.className = 'message summary-text';
      
      const summaryText = getEventSummary(event, message, metadata);
      let htmlContent = escapeHtml(summaryText);

      // Attach metadata badges if present
      if (metadata) {
        if (metadata.tool_name) {
          htmlContent = `<span class="badge badge-tool">${metadata.tool_name}</span> ` + htmlContent;
        }
        if (metadata.target) {
          htmlContent += ` <span class="badge badge-target">${escapeHtml(metadata.target)}</span>`;
        }
      }
      summarySpan.innerHTML = htmlContent;
      summaryDiv.appendChild(summarySpan);
      row.appendChild(summaryDiv);

      // Details block (sibling to the summary line)
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'console-row-details';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = message;
      pre.appendChild(code);
      detailsDiv.appendChild(pre);
      row.appendChild(detailsDiv);

      // Click to toggle handler
      const toggleHandler = (e) => {
        // Prevent toggle if text selection is active to allow copying text inside details/summary
        if (window.getSelection().toString()) return;
        
        const isExpanded = row.classList.contains('expanded');
        if (isExpanded) {
          row.classList.remove('expanded');
          row.classList.add('collapsed');
        } else {
          row.classList.add('expanded');
          row.classList.remove('collapsed');
        }
      };

      // Toggle details expansion on clicking the summary header
      summaryDiv.addEventListener('click', toggleHandler);

    } else {
      row.appendChild(timestampSpan);

      // Spacer placeholder to align non-collapsible logs
      const placeholder = document.createElement('span');
      placeholder.className = 'collapse-toggle-placeholder';
      row.appendChild(placeholder);

      const messageSpan = document.createElement('span');
      messageSpan.className = 'message';
      
      let htmlContent = escapeHtml(message);

      // Attach metadata badges if present
      if (metadata) {
        if (metadata.tool_name) {
          htmlContent = `<span class="badge badge-tool">${metadata.tool_name}</span> ` + htmlContent;
        }
        if (metadata.target) {
          htmlContent += ` <span class="badge badge-target">${escapeHtml(metadata.target)}</span>`;
        }
      }

      messageSpan.innerHTML = htmlContent;
      row.appendChild(messageSpan);
    }

    consoleFeed.appendChild(row);
    // Smooth scroll to bottom
    consoleFeed.scrollTop = consoleFeed.scrollHeight;
  }

  // System diagnostic console logging
  function appendSystemMessage(msg) {
    appendEventToConsole('system-msg', msg, null);
  }

  // Kickstart WebSockets
  connect();
});
