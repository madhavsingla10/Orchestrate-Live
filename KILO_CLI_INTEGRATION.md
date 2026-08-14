# Kilo CLI Integration in OrchestrateLive

## Overview

Kilo CLI is a fully supported AI coding assistant within OrchestrateLive's multi-run telemetry dashboard. The integration enables real-time visual and audio feedback for Kilo CLI sessions by reading its local SQLite database, parsing conversation transcripts, and broadcasting structured telemetry events to the dashboard.

---

## Supported CLI Agents

OrchestrateLive monitors multiple local AI coding assistants in parallel. Kilo CLI is one of the supported agents alongside Antigravity CLI and Claude Code.

| CLI Tool | Detection Method | Run ID Prefix | Context Window |
|----------|------------------|---------------|----------------|
| Kilo CLI | SQLite database scan | `kilo-` | 200,000 tokens |
| Claude Code | JSONL transcript scan | `claude-` | 200,000 tokens |
| Antigravity CLI | JSONL transcript scan | `conv-` | 1,000,000 tokens |

---

## How Kilo CLI Is Detected

### Database Location

OrchestrateLive locates Kilo CLI's SQLite database (`kilo.db`) by checking the following paths in order:

1. `C:\Users\rakes\.local\share\kilo\kilo.db`
2. `%LOCALAPPDATA%\kilo\kilo.db`
3. `%APPDATA%\kilo\kilo.db`
4. `~\.kilo\kilo.db`
5. `~\.config\kilo\kilo.db`

If none of these paths exist, Kilo CLI monitoring is silently disabled for that server session.

### CLI Name Detection

The `detectCliToolName()` function identifies Kilo CLI by checking if the monitored path contains the substring `kilo` (case-insensitive). When detected, the run name displayed on the dashboard is formatted as:

```
Kilo CLI (session-title-or-short-id)
```

---

## Session Scanning & Watching

### Active Session Query

The function `scanAndProcessKiloTranscripts()` runs every 250 milliseconds. It queries the `kilo.db` SQLite database for the 10 most recently updated sessions and watches the top 5 active ones.

```sql
SELECT id, title, slug, directory, time_created, time_updated, cost, tokens_input, tokens_output, model
FROM session
ORDER BY time_updated DESC
LIMIT 10;
```

### Run ID Generation

Each Kilo CLI session is assigned a unique run ID derived from the session's database ID:

- Full session ID is hashed into a short identifier
- Run ID format: `kilo-<last-8-chars-of-session-id>`
- Run name format: `Kilo CLI (<session-title-truncated-to-22-chars>)`

### Incremental Part Polling

For each active session, OrchestrateLive polls the `part` table for new rows using the last seen `rowid` as a cursor:

```sql
SELECT
  p.rowid as row_id,
  p.id as part_id,
  p.session_id,
  p.message_id,
  p.time_created,
  p.data as part_data,
  m.data as message_data
FROM part p
JOIN message m ON p.message_id = m.id
WHERE p.session_id = '<session-id>' AND p.rowid > <last-seen-row-id>
ORDER BY p.rowid ASC;
```

This ensures only new events are processed, avoiding duplicate telemetry.

---

## Event Parsing Logic

Kilo CLI transcripts are parsed through `parseKiloPartAndBroadcast()`. The function reads two JSON columns from the database:

- `part_data` (`pData`): Contains the structured part object (type, text, tool name, state, tokens, metrics, cost)
- `message_data` (`mData`): Contains the parent message metadata (role, content arrays)

### Supported Event Types

#### 1. User Message (`planning`)

**Condition:** `mData.role === 'user'` AND `pData.type === 'text'`

When the user sends a new prompt to Kilo CLI, OrchestrateLive broadcasts a `planning` event:

```json
{
  "event": "planning",
  "message": "User Request Received:\n<user prompt text>",
  "metadata": { "tokens_per_sec": 45, "context_pct": 12 }
}
```

#### 2. Assistant Thinking (`thinking`)

**Condition:** `pData.type === 'reasoning'` AND `pData.text` is non-empty

When Kilo CLI generates internal reasoning blocks, the dashboard lights up the Thought node:

```json
{
  "event": "thinking",
  "message": "<reasoning content>",
  "metadata": { "tokens_per_sec": 52, "context_pct": 15 }
}
```

#### 3. Tool Execution (`executing_tool`)

**Condition:** `pData.type === 'tool'`

Kilo CLI tool invocations are mapped to human-readable telemetry messages:

| Kilo CLI Tool Name | Mapped Tool Name | Dashboard Message |
|--------------------|------------------|-------------------|
| `bash` | `run_command` | `Executing terminal command: <command>` |
| `read`, `view` | `view_file` | `Reading file: <filename>` |
| `write`, `edit`, `multiedit` | `replace_file_content` | `Writing changes to file: <filename>` |
| `grep`, `find`, `glob` | `grep_search` | `Searching codebase for: <query>` |
| `todowrite`, `todoread` | `mcp` | `Updating workspace task list: <title>` |
| Any other tool | `<tool_name>` | `Invoking tool: <tool_name>` |

Tool errors are detected when `state.status === 'error'` or `state.error` exists, triggering a `task_error` event.

#### 4. Step Completion (`task_done`)

**Condition:** `pData.type === 'step-finish'`

When a step finishes, OrchestrateLive computes final metrics and broadcasts completion:

- If `pData.reason === 'stop'`, a `task_done` event is sent.
- Otherwise, a continuation event is broadcast with the processed token count.

The `step-finish` part also extracts exact token usage and cost data for precise metrics:

```javascript
const inputTokens = tokens.input || tokens.input_tokens || tokens.prompt_tokens || 0;
const outputTokens = tokens.output || tokens.output_tokens || tokens.completion_tokens || 0;
const cacheReadTokens = tokens.cache?.read || tokens.cache_read_input_tokens || 0;
```

#### 5. Assistant Text Output (`thinking`)

**Condition:** `mData.role === 'assistant'` AND `pData.type === 'text'`

Final text responses from Kilo CLI are broadcast as `thinking` events with the prefix `Assistant Response:`.

---

## Metrics Computation

Kilo CLI benefits from the same live metrics engine as other supported agents, with one key difference: the context window limit.

### Context Window

```javascript
const isKilo = runId.startsWith('kilo') || runState.run_name.toLowerCase().includes('kilo');
const maxContextWindow = (isClaude || isKilo) ? 200000 : 1000000;
const contextPct = Math.min(100, Math.max(0.1, Math.round((totalTokens / maxContextWindow) * 100 * 10) / 10));
```

Kilo CLI sessions are assigned a **200,000 token** context window, matching Claude Code's allocation.

### Token & Cost Tracking

- **Exact token data** is preferred when available from `step-finish` events or `usage` objects.
- **Estimated token counts** are derived from character lengths divided by 4 when exact data is unavailable.
- **Cost estimation** uses default rates ($0.15/M input, $0.60/M output) unless exact cost data is provided in the database row.

### Speed Calculation

Tokens per second are calculated using:

- Direct `tokens_per_sec` values from Kilo CLI metrics when available.
- Derived speed from token delta divided by elapsed time (capped at 180 t/s, minimum 15 t/s) for steps under 30 seconds.

---

## Real-Time Polling Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ OrchestrateLive Bridge Server                               │
│                                                             │
│  scanAndProcessKiloTranscripts() (every 250ms)             │
│       │                                                     │
│       ▼                                                     │
│  getKiloDbPath() → Locate kilo.db                          │
│       │                                                     │
│       ▼                                                     │
│  SQLite Query: Recent sessions (last 24h, top 10)          │
│       │                                                     │
│       ▼                                                     │
│  For each active session:                                   │
│    - Register watcher if new                                │
│    - Query new parts since last rowid                       │
│    - Parse each part via parseKiloPartAndBroadcast()        │
│    - Broadcast to WebSocket clients                         │
│       │                                                     │
│       ▼                                                     │
│  WebSocket /stream → Dashboard Client                       │
└─────────────────────────────────────────────────────────────┘
```

The 250ms polling interval balances responsiveness with SQLite query overhead. A scanning lock (`isKiloScanning`) prevents overlapping database queries.

---

## Dashboard Representation

On the OrchestrateLive dashboard, Kilo CLI sessions appear as colored run cards:

- **Run Badge Color:** Cycled from a fixed palette (Cyan, Violet, Teal, Amber, Pink, Blue)
- **Run Label:** `Kilo CLI (<session-title>)`
- **Pipeline Nodes:** Light up in real-time as thinking, planning, tool execution, and completion events are received
- **Audio Cues:** Programmatic Web Audio API sounds play for each state transition

---

## Technical Notes

- Kilo CLI monitoring requires `sqlite3` to be available in the system PATH for the bridge server to query the database.
- The `execFile` utility from Node.js `child_process` is used to run SQLite queries without requiring a native Node.js SQLite binding.
- Sessions are considered active if modified within the last 24 hours.
- The `watchedKiloSessions` map tracks the last processed row ID per session to enable incremental updates.
- Kilo CLI is the only supported agent that uses SQLite; all other agents use JSONL file watching.
