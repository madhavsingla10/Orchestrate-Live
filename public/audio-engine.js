/**
 * AudioTelemetryEngine synthesizes real-time sound cues using the Web Audio API.
 * Ensures zero network overhead by generating sounds programmatically in the browser.
 */
class AudioTelemetryEngine {
  constructor() {
    this.ctx = null;
    this.muted = true;
  }

  /**
   * Initializes or resumes the AudioContext on user interaction.
   */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Toggles the mute state of the engine.
   * @param {boolean} isMuted 
   */
  setMuted(isMuted) {
    this.muted = isMuted;
    if (!isMuted) {
      this.init();
    }
  }

  /**
   * Triggers the corresponding sound effect based on the event type.
   * @param {string} event - thinking | planning | executing_tool | task_done | task_error
   */
  trigger(event) {
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
        this.playExecutingTool();
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

  /**
   * Thinking Sound: Soft sine wave ping (440Hz) with 0.3s exponential decay.
   */
  playThinking() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Planning Sound: Modulated pitch sine wave (440Hz -> 660Hz) over 0.4s.
   */
  playPlanning() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(660, now + 0.4);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Executing Tool Sound: Crisp double-click sound (1200Hz clicks, 0.02s each, spaced 0.08s apart).
   */
  playExecutingTool() {
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

  /**
   * Task Done Sound: High-fidelity dual-tone chime (C5 [523.25Hz] & E5 [659.25Hz]) fading out over 0.6s.
   */
  playTaskDone() {
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

  /**
   * Error Sound: Low, warm descending warning tone (180Hz -> 120Hz) over 0.5s.
   */
  playTaskError() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle'; // triangle wave gives a warmer, rounder low tone
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

// Attach to window so it is accessible globally across dashboard scripts
window.AudioTelemetryEngine = AudioTelemetryEngine;
