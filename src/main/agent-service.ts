import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage, Options, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'
import { VisionService } from './vision-service'
import { customToolsServer } from './tools'

function findClaudeExecutable(customPath?: string | null): string {
  // If custom path is provided, use it
  if (customPath && customPath.trim()) {
    return customPath.trim()
  }

  // Otherwise, try to find it in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0]
  } catch {
    throw new Error(
      'Claude Code CLI not found. Please install it from https://claude.ai/download or configure the path in Settings.'
    )
  }
}

export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system'
  data: Record<string, unknown>
}

interface QueuedMessage {
  params: {
    content: string
    images?: Array<{ data: string; mediaType: string }>
    workingDirectory: string
    sessionId?: string
    sdkSessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
    previousTurns?: Array<{
      id: string
      userMessage: string
      images?: Array<{ data: string; mediaType: string }>
      textBlocks: string[]
      toolEvents: Array<{ type: string; tool?: string; input?: Record<string, unknown>; output?: string }>
      isComplete: boolean
      startTime: number
      endTime: number | null
      costUsd: number | null
    }>
  }
  onEvent: (event: StreamEvent) => void
  resolve: (value: { sessionId: string; success: boolean }) => void
  reject: (error: Error) => void
}

interface Session {
  id: string
  sdkSessionId: string | null
  config: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools: string[]
  }
  createdAt: Date
  isProcessing: boolean
  messageQueue: QueuedMessage[]
}

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'code_review']

export class AgentService {
  private sessions = new Map<string, Session>()
  private visionService: VisionService | null = null
  private customClaudeCodePath: string | null = null

  initializeVisionService(apiKey: string) {
    this.visionService = new VisionService(apiKey)
    console.log('[AgentService] Vision service initialized')
  }

  setClaudeCodePath(path: string | null) {
    this.customClaudeCodePath = path
    console.log('[AgentService] Claude Code path set to:', path || 'auto-detect')
  }

  createSession(params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }): { sessionId: string } {
    const id = randomUUID()

    this.sessions.set(id, {
      id,
      sdkSessionId: null,
      config: {
        workingDirectory: params.workingDirectory,
        systemPrompt: params.systemPrompt,
        allowedTools: params.allowedTools?.length ? params.allowedTools : DEFAULT_TOOLS
      },
      createdAt: new Date(),
      isProcessing: false,
      messageQueue: []
    })

    console.log('[AgentService] Session created:', id, '| Total sessions:', this.sessions.size)
    return { sessionId: id }
  }

  destroySession(sessionId: string): { success: boolean } {
    this.sessions.delete(sessionId)
    return { success: true }
  }

  getSessionInfo(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null
  }

  listActiveSessions(): Array<{
    id: string
    sdkSessionId: string | null
    workingDirectory: string
    createdAt: Date
    allowedTools: string[]
  }> {
    console.log('[AgentService] Listing active sessions, total:', this.sessions.size)
    const result = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      sdkSessionId: session.sdkSessionId,
      workingDirectory: session.config.workingDirectory,
      createdAt: session.createdAt,
      allowedTools: session.config.allowedTools
    }))
    console.log('[AgentService] Returning', result.length, 'sessions')
    return result
  }

  async sendMessage(
    params: {
      content: string
      images?: Array<{ data: string; mediaType: string }>
      workingDirectory: string
      sessionId?: string
      sdkSessionId?: string
      systemPrompt?: string
      allowedTools?: string[]
      previousTurns?: Array<{
        id: string
        userMessage: string
        images?: Array<{ data: string; mediaType: string }>
        textBlocks: string[]
        toolEvents: Array<{ type: string; tool?: string; input?: Record<string, unknown>; output?: string }>
        isComplete: boolean
        startTime: number
        endTime: number | null
        costUsd: number | null
      }>
    },
    onEvent: (event: StreamEvent) => void
  ): Promise<{ sessionId: string; success: boolean }> {
    console.log('[AgentService] sendMessage called with images:', params.images?.length || 0)

    // If images are present, use vision service to analyze them, then hand off to Agent SDK
    if (params.images && params.images.length > 0) {
      if (!this.visionService) {
        onEvent({
          event: 'error',
          data: { error: 'Vision service not initialized. Please configure your Anthropic API key.' }
        })
        return { sessionId: '', success: false }
      }

      console.log('[AgentService] Using vision service to analyze images, then handing off to Agent SDK')

      // Step 1: Get vision analysis
      let visionAnalysis = ''

      const visionResult = await this.visionService.sendMessageWithVision(
        {
          content: `Please analyze this image and provide a detailed description. The user's request is: "${params.content}"

Provide your analysis in a clear format that can be used by another AI agent to complete the task.`,
          images: params.images,
          workingDirectory: params.workingDirectory
        },
        (event) => {
          // Capture the vision response
          if (event.event === 'text') {
            visionAnalysis += event.data.text as string
          }
          // Forward events to the UI
          onEvent(event)
        }
      )

      if (!visionResult.success) {
        return { sessionId: params.sessionId || `vision-${Date.now()}`, success: false }
      }

      // Step 2: Send vision analysis to Agent SDK for actual work
      console.log('[AgentService] Vision analysis complete, handing off to Agent SDK for implementation')

      onEvent({
        event: 'system',
        data: {
          message: '🔄 Switching to Agent SDK for implementation...',
          type: 'handoff'
        }
      })

      // Construct enhanced prompt with vision analysis
      const enhancedPrompt = `Based on the following image analysis:

---
${visionAnalysis}
---

User's original request: ${params.content}

Please proceed to complete the user's request using the appropriate tools.`

      // Now send to Agent SDK without images (just text)
      return this.sendMessage(
        {
          ...params,
          content: enhancedPrompt,
          images: undefined // Remove images, we have the analysis now
        },
        onEvent
      )
    }

    // Text-only messages continue to use the Agent SDK
    let session: Session

    // If sessionId is provided, trust it and recreate session in memory if needed
    if (params.sessionId) {
      if (this.sessions.has(params.sessionId)) {
        session = this.sessions.get(params.sessionId)!
        console.log('[AgentService] Reusing existing session:', params.sessionId)
      } else {
        // Session exists on disk but not in memory - recreate it
        console.log('[AgentService] Recreating session in memory:', params.sessionId, 'with SDK session:', params.sdkSessionId || 'none')
        this.sessions.set(params.sessionId, {
          id: params.sessionId,
          sdkSessionId: params.sdkSessionId || null,
          config: {
            workingDirectory: params.workingDirectory,
            systemPrompt: params.systemPrompt,
            allowedTools: params.allowedTools?.length ? params.allowedTools : DEFAULT_TOOLS
          },
          createdAt: new Date(),
          isProcessing: false,
          messageQueue: []
        })
        session = this.sessions.get(params.sessionId)!
      }
    } else {
      // No sessionId provided - create a brand new session
      console.log('[AgentService] Creating new session')
      const { sessionId } = this.createSession({
        workingDirectory: params.workingDirectory,
        systemPrompt: params.systemPrompt,
        allowedTools: params.allowedTools
      })
      session = this.sessions.get(sessionId)!
    }

    // If already processing, queue this message
    if (session.isProcessing) {
      console.log('[AgentService] Session is already processing, queuing message (queue length:', session.messageQueue.length, ')')
      return new Promise<{ sessionId: string; success: boolean }>((resolve, reject) => {
        session.messageQueue.push({
          params,
          onEvent,
          resolve,
          reject
        })
        onEvent({
          event: 'system',
          data: { message: `Message queued (position ${session.messageQueue.length} in queue)` }
        })
      })
    }

    // Mark session as processing
    session.isProcessing = true

    try {
      const claudePath = findClaudeExecutable(this.customClaudeCodePath)

      const options: Options = {
        model: 'claude-sonnet-4-5-20250929',
        pathToClaudeCodeExecutable: claudePath,
        allowedTools: session.config.allowedTools,
        cwd: session.config.workingDirectory,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        includePartialMessages: true,
        // Load project CLAUDE.md files — these survive compaction and are
        // re-read every turn, giving the agent persistent project context
        settingSources: ['project'],
        // Add custom MCP server with your tools
        mcpServers: {
          customTools: customToolsServer
        },
        // PreCompact hook: guide what the compaction summary should preserve
        hooks: {
          PreCompact: [{
            hooks: [async (): Promise<HookJSONOutput> => {
              console.log('[AgentService] PreCompact hook fired — injecting compaction guidance')
              return {
                continue: true,
                systemMessage: [
                  'COMPACTION INSTRUCTIONS — When summarizing this conversation, you MUST preserve:',
                  '1. All file paths that were read, created, or modified, and what specific changes were made to each',
                  '2. Key architectural decisions and the reasoning behind them',
                  '3. Any errors encountered and how they were resolved',
                  '4. The current state of the task — what is done and what remains',
                  '5. User preferences, constraints, and conventions expressed during the conversation',
                  '6. Names of functions, components, variables, and types that were discussed or modified',
                  '7. Any TODO items or follow-up tasks mentioned',
                  '8. The working directory and project structure details discovered',
                  'Do NOT discard specifics about code changes — file:line references, function signatures, and exact modifications are critical for continuity.',
                ].join('\n')
              }
            }]
          }]
        },
        stderr: (data: string) => {
          console.error('[SDK stderr]', data.trim())
        }
      }

      const workDir = session.config.workingDirectory
      const directoryGuard = [
        `CRITICAL RULE — DIRECTORY RESTRICTION:`,
        `You MUST only read, write, edit, and execute files within: ${workDir}`,
        `You MUST NOT access, read, write, or modify any files or directories outside of ${workDir}.`,
        `All file paths must be within ${workDir}. Reject any request that would require accessing files outside this directory.`,
        `When using Bash, always run commands from ${workDir} and never cd outside of it.`,
      ].join('\n')

      // Build persistent session context from turns — this goes in the system
      // prompt so it survives compaction (system prompt is always re-injected)
      const sessionContext = this.buildSessionContext(params.previousTurns)

      // Assemble system prompt: guard + user prompt + session context
      const systemParts = [directoryGuard]
      if (session.config.systemPrompt) {
        systemParts.push(session.config.systemPrompt)
      }
      if (sessionContext) {
        systemParts.push(sessionContext)
      }
      options.systemPrompt = systemParts.join('\n\n')

      // Resume SDK session if available — this carries full conversation history natively
      if (session.sdkSessionId) {
        console.log('[AgentService] Resuming SDK session:', session.sdkSessionId)
        options.resume = session.sdkSessionId
      } else {
        console.log('[AgentService] Starting new SDK session', sessionContext ? '(with session context)' : '')
      }

      // Build the prompt - if images are provided, use message format
      let promptContent: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>

      if (params.images && params.images.length > 0) {
        // Multi-part message with images
        promptContent = [
          ...params.images.map(img => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.data
            }
          })),
          {
            type: 'text',
            text: params.content
          }
        ]
      } else {
        // Simple text prompt
        promptContent = params.content
      }

      console.log('[AgentService] Sending to SDK with prompt type:', Array.isArray(promptContent) ? 'multi-part' : 'text')
      if (Array.isArray(promptContent)) {
        console.log('[AgentService] Multi-part content blocks:', promptContent.length)
      }

      const stream = query({
        prompt: promptContent as any,
        options
      })

      for await (const message of stream) {
        this.handleSDKMessage(message, session, onEvent)
      }

      return { sessionId: session.id, success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[AgentService] Error:', errorMessage)
      onEvent({ event: 'error', data: { error: errorMessage } })
      return { sessionId: session.id, success: false }
    } finally {
      // Clear processing flag
      session.isProcessing = false
      console.log('[AgentService] Cleared processing flag for session:', session.id)

      // Process next queued message if any
      if (session.messageQueue.length > 0) {
        console.log('[AgentService] Processing next queued message (', session.messageQueue.length, 'messages in queue)')
        const nextMessage = session.messageQueue.shift()!

        // Process the queued message asynchronously
        this.sendMessage(nextMessage.params, nextMessage.onEvent)
          .then(nextMessage.resolve)
          .catch(nextMessage.reject)
      }
    }
  }

  /**
   * Build a persistent session context from previous turns.
   * This is included in the system prompt so it survives compaction.
   * Extracts key facts: files modified, tools used, decisions made.
   */
  private buildSessionContext(
    previousTurns?: Array<{
      id: string
      userMessage: string
      images?: Array<{ data: string; mediaType: string }>
      textBlocks: string[]
      toolEvents: Array<{ type: string; tool?: string; input?: Record<string, unknown>; output?: string }>
      isComplete: boolean
      startTime: number
      endTime: number | null
      costUsd: number | null
    }>
  ): string {
    if (!previousTurns || previousTurns.length === 0) return ''

    const filesModified = new Set<string>()
    const filesRead = new Set<string>()
    const taskSummaries: string[] = []

    for (const turn of previousTurns) {
      // Extract file operations from tool events
      for (const event of turn.toolEvents) {
        if (event.type === 'tool_use' && event.input) {
          const filePath = (event.input as Record<string, unknown>).file_path as string
            || (event.input as Record<string, unknown>).path as string
          if (filePath) {
            if (event.tool === 'Write' || event.tool === 'Edit') {
              filesModified.add(filePath)
            } else if (event.tool === 'Read') {
              filesRead.add(filePath)
            }
          }
        }
      }

      // Build a brief task summary from each turn
      if (turn.userMessage) {
        const userMsg = turn.userMessage.length > 150
          ? turn.userMessage.substring(0, 150) + '...'
          : turn.userMessage
        let summary = `- User asked: "${userMsg}"`

        if (turn.textBlocks.length > 0) {
          const response = turn.textBlocks.join(' ')
          // Extract just the first meaningful sentence of the response
          const firstSentence = response.match(/^[^.!?\n]{10,200}[.!?]/)?.[0]
          if (firstSentence) {
            summary += ` → ${firstSentence}`
          }
        }
        taskSummaries.push(summary)
      }
    }

    const parts: string[] = ['<sessionContext>']

    if (filesModified.size > 0) {
      parts.push('Files modified in this session:')
      for (const f of filesModified) {
        parts.push(`  - ${f}`)
      }
    }

    if (filesRead.size > 0 && filesRead.size <= 20) {
      parts.push('Files read in this session:')
      for (const f of filesRead) {
        parts.push(`  - ${f}`)
      }
    }

    // Include last 10 task summaries to stay within reasonable prompt size
    const recentTasks = taskSummaries.slice(-10)
    if (recentTasks.length > 0) {
      parts.push('Conversation history (most recent):')
      parts.push(...recentTasks)
    }

    parts.push('</sessionContext>')
    return parts.join('\n')
  }

  private handleSDKMessage(
    message: SDKMessage,
    session: Session,
    onEvent: (event: StreamEvent) => void
  ): void {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          onEvent({
            event: 'system',
            data: {
              model: message.model,
              tools: message.tools,
              cwd: message.cwd,
              sessionId: message.session_id
            }
          })
        } else if (message.subtype === 'compact_boundary') {
          console.log('[AgentService] Conversation compacted. Pre-compact tokens:', (message as any).compact_metadata?.pre_tokens)
          onEvent({
            event: 'system',
            data: {
              type: 'compact',
              trigger: (message as any).compact_metadata?.trigger,
              preTokens: (message as any).compact_metadata?.pre_tokens
            }
          })
        } else if (message.subtype === 'status') {
          const status = (message as any).status
          if (status === 'compacting') {
            console.log('[AgentService] Compaction in progress...')
            onEvent({
              event: 'system',
              data: { type: 'compacting' }
            })
          }
        }
        break

      case 'assistant': {
        session.sdkSessionId = message.session_id

        const assistantMessage = message.message
        if (assistantMessage?.content) {
          for (const block of assistantMessage.content) {
            if (block.type === 'text') {
              onEvent({
                event: 'text',
                data: { text: block.text }
              })
            } else if (block.type === 'tool_use') {
              onEvent({
                event: 'tool_use',
                data: {
                  tool: block.name,
                  toolUseId: block.id,
                  input: block.input
                }
              })
            }
          }
        }
        break
      }

      case 'user': {
        const userMessage = message.message
        if (userMessage?.content && Array.isArray(userMessage.content)) {
          for (const block of userMessage.content) {
            if (typeof block === 'object' && 'type' in block && block.type === 'tool_result') {
              onEvent({
                event: 'tool_result',
                data: {
                  toolUseId: (block as Record<string, unknown>).tool_use_id,
                  content: (block as Record<string, unknown>).content
                }
              })
            }
          }
        }
        break
      }

      case 'result':
        onEvent({
          event: 'done',
          data: {
            sessionId: session.id,
            sdkSessionId: message.session_id,
            subtype: message.subtype,
            isError: message.is_error,
            numTurns: message.num_turns,
            costUsd: message.total_cost_usd,
            result: message.subtype === 'success' ? (message as { result?: string }).result : undefined
          }
        })
        break
    }
  }
}
