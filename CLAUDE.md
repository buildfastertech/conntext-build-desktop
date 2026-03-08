# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ConnText Build is a local AI-powered code generation agent built as an Electron desktop application. It provides a chat interface that wraps the Claude Agent SDK, allowing users to interact with Claude Code within a sandboxed working directory. The application includes a memory system (MEMORY.md) for persistent context storage across sessions.

## Development Commands

### Running the Application
- **`npm run dev`** - Start development mode with hot reload (main + renderer)
- **`npm run preview`** - Preview the built application

### Building
- **`npm run build`** - Build for production (all platforms)
- **`npm run build:win`** - Build for Windows only
- **`npm run build:mac`** - Build for macOS only

### Type Checking
- **`npm run typecheck`** - Run TypeScript type checking without emitting files

## Architecture Overview

### Electron Process Structure

The application follows the standard Electron architecture with three distinct processes:

#### Main Process (`src/main/`)
- **`index.ts`** - Application entry point, IPC handler registration, window creation
- **`agent-service.ts`** - Wraps `@anthropic-ai/claude-agent-sdk` for streaming agent interactions
- **`auth-store.ts`** - Manages encrypted credential storage using `electron-store`

The main process is responsible for:
- Creating and managing the browser window
- Handling all file system operations (read/write) via IPC
- Managing agent sessions and streaming responses
- Enforcing directory restrictions on agent operations
- Storing user credentials securely

#### Preload Script (`src/preload/`)
- **`index.ts`** - Exposes safe IPC API to renderer via `contextBridge`
- **`index.d.ts`** - TypeScript definitions for the exposed API

The preload script creates a secure bridge between main and renderer processes, exposing only approved APIs through `window.api`.

#### Renderer Process (`src/renderer/`)
- **`src/App.tsx`** - Root component, handles authentication flow
- **`src/screens/LoginScreen.tsx`** - Authentication UI
- **`src/screens/BuildScreen.tsx`** - Main chat interface with agent
- **`src/screens/SetupScreen.tsx`** - Initial setup flow
- **`src/components/ResizablePanes.tsx`** - Two-pane resizable layout component
- **`src/components/MemoryDialog.tsx`** - Modal for viewing memory entries

The renderer uses React 19 with TypeScript and Tailwind CSS v4.

### Agent Service Architecture

The `AgentService` class manages conversational sessions with the Claude Agent SDK:

1. **Session Management**: Each conversation has a unique session ID that persists across multiple messages
2. **Streaming**: Agent responses stream through IPC events (`agent:stream-event`) to provide real-time feedback
3. **Directory Restriction**: Every agent request includes a critical system prompt that restricts file operations to the selected working directory
4. **Tool Allowlist**: Defaults to `['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']`
5. **Event Types**: `text`, `tool_use`, `tool_result`, `done`, `error`, `system`

**Important**: The agent service finds the Claude Code CLI executable using `which claude` (Unix) or `where claude` (Windows). The CLI must be installed and in PATH.

### Memory System

The application implements a persistent memory system:

- **File**: `MEMORY.md` in the working directory
- **Initialization**: `/init` slash command creates the file
- **Storage**: Users can type "save to memory: <content>" to append entries
- **Format**: Markdown with timestamped `##` headers for each entry
- **UI**: Memory dialog shows all entries, feature card shows entry count

Memory is loaded when a working directory is selected and reloaded after any changes.

### IPC Communication Pattern

All communication between renderer and main follows this pattern:

1. Renderer calls `window.api.<method>()` (exposed by preload)
2. Preload invokes `ipcRenderer.invoke('<channel>', ...args)`
3. Main process handles via `ipcMain.handle('<channel>', handler)`
4. For streaming, main sends events via `webContents.send()` and renderer listens via `ipcRenderer.on()`

**IPC Channels:**
- `auth:get-credentials`, `auth:save-credentials`, `auth:clear-credentials`
- `dialog:select-folder`
- `fs:read-file`, `fs:write-file`
- `agent:send-message`, `agent:create-session`, `agent:destroy-session`
- `agent:stream-event` (main → renderer streaming)

### Build Configuration

The project uses `electron-vite` for building:

- **Main + Preload**: Node.js environment, ESNext modules, external dependencies bundled except SDK
- **Renderer**: Vite with React plugin and Tailwind CSS v4 Vite plugin
- **Output**: `out/` directory with `main/`, `preload/`, `renderer/` subdirectories

TypeScript configuration is split:
- `tsconfig.node.json` - Main and preload (Node.js)
- `tsconfig.web.json` - Renderer (DOM + React)
- Path alias `@/*` → `src/renderer/src/*` (renderer only)

### State Management

The renderer uses React hooks for state management:

- **BuildScreen** maintains:
  - `turns[]` - Array of conversation turns with text blocks and tool events
  - `sessionId` - Current agent session
  - `activeTurnIdRef` - Ref to the currently streaming turn
  - `workingDirectory` - Selected project folder
  - `memories[]` - Parsed memory entries
  - `isStreaming` - Whether an agent response is in progress

- **Turn structure**:
  ```typescript
  interface Turn {
    id: string
    userMessage: string
    textBlocks: string[]      // Interleaved with tool events
    toolEvents: ToolEvent[]   // tool_use and tool_result events
    isComplete: boolean
    startTime: number
    endTime: number | null
    costUsd: number | null
  }
  ```

Streaming events update the active turn's `textBlocks` and `toolEvents` arrays in real-time.

### UI Design System

Tailwind CSS v4 with custom CSS variables for theming:
- Color scheme uses `brand-*` custom properties
- Dark theme optimized for long coding sessions
- Components use consistent spacing and border radii
- Purple accent color (`brand-purple`) for primary actions

## Key Implementation Details

### Directory Restriction Enforcement

The agent service injects a critical system prompt for every request:

```
CRITICAL RULE — DIRECTORY RESTRICTION:
You MUST only read, write, edit, and execute files within: <workingDirectory>
You MUST NOT access, read, write, or modify any files or directories outside of <workingDirectory>.
All file paths must be within <workingDirectory>. Reject any request that would require accessing files outside this directory.
When using Bash, always run commands from <workingDirectory> and never cd outside of it.
```

This prevents the agent from accessing files outside the selected folder.

### Slash Commands

The application supports two types of slash commands:

#### System Commands
Handled entirely in the renderer (`BuildScreen.tsx`) and **never sent to the agent**:
- **`/init`** - Creates `MEMORY.md` with initial template using `window.api.writeFile`
- System commands execute locally and return early before any agent call

#### Agent Commands
Future commands that will be forwarded to the Claude Agent for processing.

#### Command Processing Flow
1. User types a message starting with `/`
2. Extract command name (first word)
3. Check if it's a registered system command
4. If system command: execute locally and return (no agent call)
5. If agent command: forward to agent service
6. If unrecognized: show error with available commands (no agent call)

Regular messages (non-slash) are always sent to the agent.

### Session Resumption

The `AgentService` supports session resumption:
- First message creates a new session
- Subsequent messages with `sessionId` resume the existing SDK session
- The `sdkSessionId` (from SDK) is stored in the session object
- Pass `options.resume = sdkSessionId` to continue conversation context

### Error Handling

- File operations return empty string for ENOENT errors (file not found)
- Agent errors are streamed as `error` events and displayed inline
- Authentication failures redirect to login screen
- Missing Claude CLI shows user-friendly error message

## Common Development Patterns

### Adding a New IPC Handler

1. Add handler in `src/main/index.ts`:
   ```typescript
   ipcMain.handle('namespace:action', async (_event, ...args) => {
     // implementation
   })
   ```

2. Expose in `src/preload/index.ts`:
   ```typescript
   const api = {
     methodName: (...args) => ipcRenderer.invoke('namespace:action', ...args)
   }
   ```

3. Add type in `src/preload/index.d.ts`:
   ```typescript
   methodName: (...args) => Promise<ReturnType>
   ```

4. Use in renderer:
   ```typescript
   const result = await window.api.methodName(...args)
   ```

### Extending Stream Events

To add new event types:

1. Update `StreamEvent` type in both `src/main/agent-service.ts` and `src/preload/index.ts`
2. Add case in `handleSDKMessage()` in `agent-service.ts`
3. Handle in `useEffect` stream listener in `BuildScreen.tsx`

### Adding UI Components

- Place shared components in `src/renderer/src/components/`
- Use Tailwind utility classes with `brand-*` color variables
- Import types from `../../preload/index.d` for IPC-related types
- Follow the existing pattern of controlled components with TypeScript

### Adding Slash Commands

**For System Commands** (handled locally, no agent call):

1. Add command handler in `BuildScreen.tsx` within the `handleSend` function:
   ```typescript
   if (command === '/yourcommand') {
     handleYourCommand()
     return  // Important: return early to prevent agent call
   }
   ```

2. Implement the handler function:
   ```typescript
   const handleYourCommand = async () => {
     // Create a turn for UI feedback
     const turnId = crypto.randomUUID()
     const newTurn: Turn = { /* ... */ }
     setTurns((prev) => [...prev, newTurn])

     // Execute command logic (use window.api.* for IPC)
     // Update turn state when complete
   }
   ```

3. Update the unknown command message to list the new command

**For Agent Commands** (forwarded to Claude):
- Simply don't add a special case handler
- The command will be sent to the agent as-is in the regular message flow

## Dependencies

### Production
- **`@anthropic-ai/claude-agent-sdk`** - Core agent functionality
- **`electron-store`** - Encrypted persistent storage
- **`react`, `react-dom`** - UI framework
- **`react-markdown`** - Markdown rendering in chat
- **`uuid`** - Session ID generation

### Development
- **`electron`** - Desktop app framework
- **`electron-builder`** - App packaging and distribution
- **`electron-vite`** - Build tooling optimized for Electron
- **`@vitejs/plugin-react`** - React Fast Refresh support
- **`tailwindcss`, `@tailwindcss/vite`** - Styling
- **`typescript`** - Type safety

## External Requirements

**Claude Code CLI** must be installed and available in PATH:
- Install from https://claude.ai/download
- Verify with `which claude` (Unix) or `where claude` (Windows)
- The agent service will fail with a clear error if not found
