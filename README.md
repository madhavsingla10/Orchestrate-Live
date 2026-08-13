# OrchestrateLive — AI Agent Telemetry & Sound Dashboard

OrchestrateLive is a real-time visual control room and telemetry dashboard that transforms raw terminal logs from local AI coding assistants (such as Agent Orchestrator, Cursor, or custom workflows) into an interactive visual display with synthesized audio feedback.

Built to run entirely on your local machine (`localhost`), it features programmatic sound synthesis via the Web Audio API (meaning zero external asset loading) and connects via WebSockets to a lightweight Node.js/Express bridge server.

---

## 🚀 Key Features

*   **Live Visual Pipeline Map:** Flowchart nodes (`[Thought] → [Planning] → [Tool Execution] → [Done]`) light up dynamically in real time, shifting automatically based on the agent's state, including a full-dashboard error state.
*   **Web Audio API Synthesizer:** Real-time, lightweight sound cues generated programmatically in the browser. Zero network asset overhead or external audio file requests.
    *   *Thought:* Soft sine-wave ping (440Hz) with 0.3s exponential decay.
    *   *Planning:* Rising pitch sine-wave sweep (440Hz → 660Hz) over 0.4s.
    *   *Tool Execution:* Crisp click sound (double-click 1200Hz, 0.02s duration, 0.08s spacing).
    *   *Done:* High-fidelity dual-tone chime (C5 & E5) fading out over 0.6s.
    *   *Error:* Low, warm descending warning triangle-wave tone (180Hz → 120Hz) over 0.5s.
*   **Real-Time Metrics Ribbon:** Instant telemetry details tracking pipeline stream latency (ms), token processing speed (tokens/sec), and context window percentage.
*   **Activity Console Feed:** A chronological scrolling log viewport showing timestamped updates, color-coded status logs, and styled metadata badges for tools (e.g. `replace_file_content`) and targets.
*   **Audio Safety Lock:** Complies with modern browser security policies; audio is locked/muted by default until the user clicks the "Enable Audio" toggle, resuming the audio context safely.
*   **Local & Secure:** No external cloud dependencies, databases, or API keys needed. Kept 100% private to your local environment.

---

## 📂 Project Structure

```text
Orchestrate Live/
├── test/
│   ├── demo_telemetry.js       # Demo telemetry stream script
│   └── simulate_multirun.js    # Multi-run parallel CLI telemetry simulation script
├── server/
│   ├── package.json            # Node project configuration & dependencies (Express, ws)
│   └── server.js               # Express & WebSocket bridge server
├── public/
│   ├── index.html              # Dashboard frontend HTML structure
│   ├── style.css               # Dark theme (Obsidian-inspired) and glowing animations
│   ├── app.js                  # Frontend WebSocket client and DOM controller
│   └── audio-engine.js         # Programmatic sound synthesizer (Web Audio API)
├── MVP_Plan.md                 # Original MVP architecture and requirements specification
├── Plan.md                     # High-level build plan
├── Problem_and_Solution.md     # Problem definition and solution design notes
└── README.md                   # Setup and usage documentation (this file)
```

---

## 🛠️ Getting Started

Follow these steps to set up and run OrchestrateLive locally:

### 1. Install Dependencies
Open a terminal, navigate to the `server` directory, and install the required NPM packages:
```bash
cd server
npm install
```

### 2. Start the Bridge Server
Launch the HTTP and WebSocket bridge server:
```bash
node server.js
```
The server starts on port `3000` by default:
`[Server] OrchestrateLive Bridge Server listening at http://localhost:3000`

### 3. Open the Dashboard UI
Open your web browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

> [!IMPORTANT]
> Click **Enable Audio** at the top-right of the screen to unlock real-time sound cues! Browsers block programmatically-generated audio until a user interaction occurs.

---

## ⚙️ Running Telemetry Simulations

You can simulate running AI coding agents sending parallel updates to test multi-run views and error handling.

### Parallel Multi-Run Simulation
Run the multi-run simulator to step through parallel agent telemetry (`CLI 1 - Backend Refactor` & `CLI 2 - Stitch MCP Worker`):
```bash
npm run simulate:multi
# or directly: node test/simulate_multirun.js
```

### Demo Telemetry Stream
Run the demo script:
```bash
npm run demo
# or directly: node test/demo_telemetry.js
```


---

## 🔍 Automated AI Agent Workspace Watcher

OrchestrateLive features a built-in **Workspace Watcher** integrated directly into the bridge server. 

When you start the bridge server (`node server/server.js`), it automatically scans your local AI developer environment (such as Google Antigravity) to find the most recent conversation transcript logs. It then watches the active conversation's `transcript.jsonl` file in real time.

### How it works:
1. **User Prompts:** When you type a new prompt to your AI coder, the dashboard receives a `planning` event.
2. **AI Reasoning:** As the AI thinks, it extracts the agent's raw thinking blocks and flashes the **Thought** node.
3. **Tool & Command Execution:** Every time the AI runs terminal commands (like `npm run dev` or `git commit`) or modifies code files, the dashboard:
   - Lights up the **Tool Execution** node.
   - Attaches customized tags (e.g., `run_command`, `replace_file_content`).
   - Streams the raw command execution stdout/stderr directly into the **Live Activity Feed** dynamically!
4. **Completion / Failure:** When the AI completes its response, the dashboard triggers a happy success chime. If a command or tool exits with an error status, it flashes the global error theme.

---


## 📡 Integration & API Reference

OrchestrateLive receives log packets via a POST request at `/api/telemetry` and immediately broadcasts them to active WebSocket clients listening at `/stream`.

### Telemetry Request Schema
```http
POST /api/telemetry
Content-Type: application/json
```

```json
{
  "event": "executing_tool",
  "message": "Modifying layout properties in public/style.css",
  "timestamp": "2026-08-13T14:00:00.000Z",
  "metadata": {
    "tool_name": "replace_file_content",
    "target": "public/style.css",
    "context_pct": 48
  }
}
```

#### Field Details:
*   `event` *(Required - String)*: The agent's current state. Must be one of:
    *   `thinking` (Lights up the Thought node)
    *   `planning` (Lights up the Planning node)
    *   `executing_tool` (Lights up the Tool Execution node)
    *   `task_done` (Lights up the Done node)
    *   `task_error` (Fails all nodes into red alert styling)
*   `message` *(Required - String)*: The human-readable description of what the agent is doing.
*   `timestamp` *(Optional - ISO String)*: Telemetry timestamp. If omitted, the server generates a current timestamp. Used to calculate stream latency on the client.
*   `metadata` *(Optional - Object)*: Additional contextual attributes:
    *   `tool_name` *(String)*: Name of the executed tool (renders a monospace label in the feed).
    *   `target` *(String)*: File path, command, or resource being operated on.
    *   `context_pct` *(Number)*: Displays current context usage (e.g. `45%`).
    *   `tokens_per_sec` *(Number)*: Displays agent response speed (e.g. `35 t/s`).
    *   `elapsed_seconds` *(Number)*: Total seconds taken by the agent.
