/**
 * AudioTelemetryEngine synthesizes real-time sound cues using the Web Audio API.
 * Ensures zero network overhead by generating sounds programmatically in the browser.
 */
class AudioTelemetryEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(isMuted) {
    this.muted = isMuted;
    if (!isMuted) {
      this.init();
    }
  }

  trigger(event, toolName) {
    if (this.muted) return;
    this.init();

    switch (event) {
      case 'thinking':
        this.playThinking();
        break;
      case 'planning':
        this.playPlanning();
        break;
      case 'executing_tool':
        if (toolName && (toolName.startsWith('mcp_') || toolName.includes('mcp') || toolName.includes('stitch') || ['call_mcp_tool', 'create_project', 'generate_screen_from_text'].includes(toolName))) {
          this.playExecutingTool();
        } else if (['view_file', 'list_dir', 'list_directory', 'grep_search', 'search_web', 'read_url_content'].includes(toolName)) {
          this.playReadingFile();
        } else if (['replace_file_content', 'write_to_file', 'multi_replace_file_content', 'code_action'].includes(toolName)) {
          this.playWritingCode();
        } else if (toolName === 'run_command') {
          this.playTerminalCommand();
        } else {
          this.playExecutingTool();
        }
        break;
      case 'task_done':
        this.playTaskDone();
        break;
      case 'task_error':
        this.playTaskError();
        break;
      default:
        console.warn(`[AudioEngine] Unknown event type: ${event}`);
    }
  }

  playThinking() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(550, now + 0.15);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playPlanning() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playReadingFile() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, now);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  playWritingCode() {
    if (!this.ctx) return;
    const playTap = (time) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, time);
      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.025);
    };
    const now = this.ctx.currentTime;
    playTap(now);
    playTap(now + 0.05);
  }

  playTerminalCommand() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.07);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playExecutingTool() {
    if (!this.ctx) return;
    const playClick = (time) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.025);
    };
    const now = this.ctx.currentTime;
    playClick(now);
    playClick(now + 0.08);
  }

  playTaskDone() {
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.6);
    osc2.stop(now + 0.6);
  }

  playTaskError() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.5);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

window.AudioTelemetryEngine = AudioTelemetryEngine;
