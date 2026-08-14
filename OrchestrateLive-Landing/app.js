// ==========================================================
// OrchestrateLive — Real Interface Interactive Logic Engine
// ==========================================================

const GITHUB_REPO_URL = 'https://github.com/madhavsingla10/Orchestrate-Live';

document.addEventListener('DOMContentLoaded', () => {
  initGitHubStarLinks();
  initCopyCommand();
  initVideoUploadAndPlayer();
  initWebAudioEngine();
  initRealInterfaceSimulator();
  initFaqAccordion();
});

function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-accordion details');
  faqItems.forEach(targetItem => {
    targetItem.addEventListener('toggle', () => {
      if (targetItem.open) {
        faqItems.forEach(item => {
          if (item !== targetItem && item.open) {
            item.open = false;
          }
        });
      }
    });
  });
}

function initCopyCommand() {
  const copyPill = document.getElementById('copy-cmd-pill');
  if (!copyPill) return;
  copyPill.addEventListener('click', () => {
    const cmdText = 'git clone https://github.com/madhavsingla10/Orchestrate-Live.git';
    navigator.clipboard.writeText(cmdText).then(() => {
      const badge = copyPill.querySelector('.copy-badge');
      if (badge) {
        const originalHTML = badge.innerHTML;
        badge.innerHTML = '✓ Copied!';
        badge.style.color = '#10b981';
        setTimeout(() => {
          badge.innerHTML = originalHTML;
          badge.style.color = '';
        }, 2000);
      }
    }).catch(() => {});
  });
}

/* ==========================================================
   1. Direct GitHub Repo Link Manager (No Modal Popup)
   ========================================================== */
function initGitHubStarLinks() {
  const starBtns = [
    document.getElementById('nav-star-btn'),
    document.getElementById('hero-star-btn'),
    document.getElementById('footer-star-btn'),
    document.getElementById('foot-star-prompt')
  ];

  starBtns.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(GITHUB_REPO_URL, '_blank');
    });
  });
}

/* ==========================================================
   2. Video Upload & Player Handler
   ========================================================== */
function initVideoUploadAndPlayer() {
  const videoElement = document.getElementById('main-demo-video');
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('video-file-input');
  const browseBtn = document.getElementById('btn-browse-video');
  const changeVideoBtn = document.getElementById('btn-change-video');
  const filenameDisplay = document.getElementById('video-filename-display');

  if (!videoElement) return;

  if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fileInput) fileInput.click();
    });
  }

  if (changeVideoBtn) {
    changeVideoBtn.addEventListener('click', () => {
      if (dropzone) dropzone.classList.remove('hidden');
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleVideoFile(file);
    });
  }

  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files[0];
      if (file && file.type.startsWith('video/')) {
        handleVideoFile(file);
      }
    });

    dropzone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  function handleVideoFile(file) {
    const videoURL = URL.createObjectURL(file);
    videoElement.src = videoURL;
    if (filenameDisplay) filenameDisplay.textContent = file.name;
    if (dropzone) dropzone.classList.add('hidden');
    videoElement.play().catch(() => {});
  }
}

/* ==========================================================
   3. Web Audio API Telemetry Engine & Waveform Visualizer
   ========================================================== */
let audioCtx = null;
let vizCanvas = null;
let vizCtx = null;
let activeWave = 0;

function initWebAudioEngine() {
  vizCanvas = document.getElementById('sound-canvas');
  if (vizCanvas) vizCtx = vizCanvas.getContext('2d');

  const btnThought = document.getElementById('snd-thought');
  const btnTool = document.getElementById('snd-tool');
  const btnDone = document.getElementById('snd-done');
  const btnError = document.getElementById('snd-error');

  if (btnThought) btnThought.addEventListener('click', () => playSound('thought'));
  if (btnTool) btnTool.addEventListener('click', () => playSound('tool'));
  if (btnDone) btnDone.addEventListener('click', () => playSound('done'));
  if (btnError) btnError.addEventListener('click', () => playSound('error'));

  startWaveformAnimation();
}

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    activeWave = 1.0;

    if (type === 'thought') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(550, now + 0.15);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);

    } else if (type === 'tool') {
      [0, 0.05].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now + offset);
        gain.gain.setValueAtTime(0.08, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.03);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.04);
      });

    } else if (type === 'done') {
      const notes = [659.25, 830.61, 987.77];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + (idx * 0.06));
        gain.gain.setValueAtTime(0.12, now + (idx * 0.06));
        gain.gain.exponentialRampToValueAtTime(0.001, now + (idx * 0.06) + 0.4);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + (idx * 0.06));
        osc.stop(now + (idx * 0.06) + 0.45);
      });

    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.3);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (e) {
    console.log('Audio touch initialization.');
  }
}

function startWaveformAnimation() {
  if (!vizCtx || !vizCanvas) return;
  let phase = 0;

  function render() {
    requestAnimationFrame(render);
    vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
    
    vizCtx.beginPath();
    vizCtx.lineWidth = 2;
    vizCtx.strokeStyle = '#10b981';

    const width = vizCanvas.width;
    const height = vizCanvas.height;
    const centerY = height / 2;
    
    phase += 0.08;
    activeWave *= 0.95;

    const amplitude = 6 + (activeWave * 28);

    for (let x = 0; x < width; x++) {
      const y = centerY + Math.sin((x * 0.05) + phase) * amplitude * Math.sin((x / width) * Math.PI);
      if (x === 0) vizCtx.moveTo(x, y);
      else vizCtx.lineTo(x, y);
    }
    
    vizCtx.stroke();
  }

  render();
}

/* ==========================================================
   4. Real OrchestrateLive Interface Live Telemetry Simulator
   ========================================================== */
function initRealInterfaceSimulator() {
  const simTrigger = document.getElementById('hero-sim-trigger');
  if (!simTrigger) return;

  const nodes = {
    thought: document.getElementById('pnode-thought'),
    planning: document.getElementById('pnode-planning'),
    reading: document.getElementById('pnode-reading'),
    writing: document.getElementById('pnode-writing'),
    terminal: document.getElementById('pnode-terminal'),
    mcp: document.getElementById('pnode-mcp'),
    done: document.getElementById('pnode-done')
  };

  const feedRowsContainer = document.getElementById('sim-feed-rows');
  const latencyEl = document.getElementById('real-metric-latency');
  const speedEl = document.getElementById('real-metric-speed');
  const costEl = document.getElementById('real-metric-cost');
  const eventCountBadge = document.getElementById('sim-event-count');

  let isRunning = false;

  simTrigger.addEventListener('click', () => {
    if (isRunning) return;
    isRunning = true;
    simTrigger.disabled = true;
    simTrigger.style.opacity = '0.5';

    runTelemetryStreamSimulation();
  });

  function clearActiveNodes() {
    Object.values(nodes).forEach(n => n && n.classList.remove('active'));
  }

  function activateNode(key) {
    clearActiveNodes();
    if (nodes[key]) nodes[key].classList.add('active');
  }

  function appendLogEvent(agentClass, agentName, typeClass, typeLabel, msg) {
    if (!feedRowsContainer) return;
    const row = document.createElement('div');
    row.className = 'feed-row';
    const nowStr = new Date().toTimeString().split(' ')[0];
    row.innerHTML = `
      <span class="ts">[${nowStr}]</span>
      <span class="agent-tag ${agentClass}">${agentName}</span>
      <span class="event-type ${typeClass}">${typeLabel}</span>
      <span class="msg">${msg}</span>
    `;
    feedRowsContainer.appendChild(row);
    feedRowsContainer.scrollTop = feedRowsContainer.scrollHeight;
    
    const count = feedRowsContainer.children.length;
    if (eventCountBadge) eventCountBadge.textContent = `${count} Events`;
  }

  const runCards = [
    document.getElementById('run-card-1'),
    document.getElementById('run-card-2'),
    document.getElementById('run-card-3'),
    document.getElementById('run-card-4')
  ];

  async function runTelemetryStreamSimulation() {
    // Cycle card 1
    highlightCard(0);
    playSound('thought');
    if (speedEl) speedEl.textContent = '66 t/s';
    if (latencyEl) latencyEl.textContent = '14,210 ms';
    await delay(1000);

    // Cycle card 2
    highlightCard(1);
    playSound('tool');
    if (speedEl) speedEl.textContent = '15 t/s';
    if (latencyEl) latencyEl.textContent = '3,790 ms';
    await delay(1000);

    // Cycle card 3
    highlightCard(2);
    playSound('tool');
    if (speedEl) speedEl.textContent = '62 t/s';
    if (latencyEl) latencyEl.textContent = '0 ms';
    await delay(1000);

    // Cycle card 4
    highlightCard(3);
    playSound('done');
    if (speedEl) speedEl.textContent = '52 t/s';
    if (latencyEl) latencyEl.textContent = '2 ms';
    await delay(1200);

    // Highlight all
    runCards.forEach(c => c && c.classList.add('highlight'));
    await delay(1500);
    runCards.forEach(c => c && c.classList.remove('highlight'));

    isRunning = false;
    simTrigger.disabled = false;
    simTrigger.style.opacity = '1';
  }

  function highlightCard(idx) {
    runCards.forEach((c, i) => {
      if (c) {
        if (i === idx) c.classList.add('highlight');
        else c.classList.remove('highlight');
      }
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
