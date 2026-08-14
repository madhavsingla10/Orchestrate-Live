# OrchestrateLive 🎬

**Real-Time Live Visual Monitor & Sound Dashboard for AI Coding Assistants**

OrchestrateLive is a simple, visually stunning control panel for watching your local AI coding tools (such as **Antigravity CLI**, **Claude Code**, **Kilo CLI**, and custom workflows) work in real-time. 

It tracks what your AI is doing step-by-step, shows token usage metrics, and plays helpful sound cues when tasks complete.

---

## ✨ Features

* 🚦 **Live Pipeline Map:** Watch status lights update live as your AI moves through **Thought ➜ Planning ➜ Reading ➜ Writing ➜ Terminal ➜ Done**.
* 🔢 **Token & Speed Counter:** Real-time token counter showing **IN / OUT** tokens (`1.2k in / 450 out`) and processing speed (`t/s`).
* 🎵 **Sound Effects:** Instant sound cues when your AI finishes a task, executes tools, or hits an error.
* 👥 **Multi-Agent Support:** View a single CLI in full detail or monitor multiple AI agents working in parallel.
* 🔒 **100% Local & Private:** Runs entirely on `localhost`. Your code and logs never leave your computer.

---

## 🚀 Quick Start in 3 Steps

### 1. Open Terminal & Install
```bash
cd server
npm install
```

### 2. Start the Server
```bash
node server.js
```

### 3. Open in Browser
Go to **[http://localhost:3000](http://localhost:3000)** in your web browser!

> 💡 **Tip:** Click **Enable Audio** at the top-right of the dashboard to turn on sound cues.

---

## 🎮 How It Works

1. **Automatic Session Detection:** OrchestrateLive automatically detects your active AI coding CLI sessions.
2. **Real-Time Live Updates:** As your AI writes code or runs shell commands, updates stream onto your screen instantly.
3. **Smart Tab Switching:**
   * When **1 agent** is working, the dashboard automatically opens that agent's detailed view.
   * When **multiple agents** are working, it displays the **All Runs** parallel grid view.

---

## 📂 Project Overview

```text
Orchestrate-Live/
├── server/
│   ├── server.js          # Express & WebSocket bridge server + workspace watcher
│   └── package.json       # Dependencies
└── public/
    ├── index.html         # Dashboard interface
    ├── app.js             # Live UI controller
    ├── style.css          # Theme styles & animations
    └── audio-engine.js    # Sound synthesizer
```

---

## 🛠️ Testing with Demo Simulations

Want to try the dashboard before connecting real AI runs? Run our built-in simulator:

```bash
cd server
npm run simulate:multi
```
This launches a simulation of two parallel AI agents working side-by-side!
