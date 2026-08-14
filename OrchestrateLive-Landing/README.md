# OrchestrateLive — Landing Page & Showcase Web App 🎬✨

This repository contains the standalone, high-performance, interactive showcase frontend and landing page for **OrchestrateLive**.

---

## 🌟 Key Features

* ⭐ **GitHub Star Conversion Prompts:** Prominent star CTAs, live star count updates, copyable repository links, and interactive star confirmation modal.
* 📹 **Interactive Video Showcase & Drag-and-Drop Uploader:** Dedicated showcase frame with an integrated drag & drop zone allowing users to drop their project demo video file (`.mp4`, `.webm`) for instant local video playback.
* 🚦 **Interactive Live AI Agent Simulator:** Interactive hero frame featuring a 5-node pipeline flowchart (Thought ➜ Planning ➜ Reading ➜ Writing ➜ Complete), live token counter incrementing, and generation speed tracking directly in the browser.
* 🎵 **Sci-Fi Web Audio Telemetry Playground:** Built-in Web Audio API sound synthesizer with interactive sound buttons (Thinking Ping, Tool Execute Click, Completion Chime, Error Sawtooth) and live HTML5 canvas frequency visualizer.
* 🎯 **User-Friendly Technical Copy:** Designed to highlight developer utility without overwhelming non-technical viewers, covering real-time log tailing, WebSocket streaming, 100% privacy on `localhost`, and universal CLI support.

---

## 🚀 How to Run Locally

### Option 1: Using Vite (Recommended)
```bash
npm install
npm run dev
```
Then open **[http://localhost:5173](http://localhost:5173)** in your web browser!

### Option 2: Serving statically or opening `index.html`
Because this frontend uses standard HTML5, CSS3, and ES Modules, you can also serve it with any static web server (such as Live Server, `npx serve`, or Python `http.server`).

---

## 📹 Customizing Your Demo Video

To permanently include your own demo video on the landing page:
1. Copy your video file (e.g. `orchestrate_demo.mp4`) into the `assets/` folder as `assets/demo.mp4`.
2. Or use the **Select Video File / Drag & Drop** area right on the landing page to preview your video live!

---

## 📂 Project Structure

```text
OrchestrateLive-Landing/
├── assets/
│   └── hero-preview.jpg     # Generated high-resolution dashboard preview image
├── index.html               # Main structured landing page HTML
├── styles.css               # Modern dark theme design system & animations
├── app.js                   # Interactive logic, audio engine, video uploader & simulator
├── package.json             # Vite configuration & scripts
└── README.md                # Documentation
```
