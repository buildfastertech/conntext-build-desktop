import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage, Options } from '@anthropic-ai/claude-agent-sdk'
import { v4 as uuidv4 } from 'uuid'
import { execSync } from 'child_process'

function findClaudeExecutable(): string {
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0]
  } catch {
    throw new Error(
      'Claude Code CLI not found. Please install it from https://claude.ai/download'
    )
  }
}

export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system'
  data: Record<string, unknown>
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
}

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']

export class AgentService {
  private sessions = new Map<string, Session>()

  createSession(params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }): { sessionId: string } {
    const id = uuidv4()

    this.sessions.set(id, {
      id,
      sdkSessionId: null,
      config: {
        workingDirectory: params.workingDirectory,
        systemPrompt: params.systemPrompt,
        allowedTools: params.allowedTools?.length ? params.allowedTools : DEFAULT_TOOLS
      },
      createdAt: new Date()
    })

    return { sessionId: id }
  }

  destroySession(sessionId: string): { success: boolean } {
    this.sessions.delete(sessionId)
    return { success: true }
  }

  async sendMessage(
    params: {
      content: string
      workingDirectory: string
      sessionId?: string
      systemPrompt?: string
      allowedTools?: string[]
    },
    onEvent: (event: StreamEvent) => void
  ): Promise<{ sessionId: string; success: boolean }> {
    let session: Session
    if (params.sessionId && this.sessions.has(params.sessionId)) {
      session = this.sessions.get(params.sessionId)!
    } else {
      const { sessionId } = this.createSession({
        workingDirectory: params.workingDirectory,
        systemPrompt: params.systemPrompt,
        allowedTools: params.allowedTools
      })
      session = this.sessions.get(sessionId)!
    }

    try {
      const claudePath = findClaudeExecutable()

      const options: Options = {
        model: 'claude-sonnet-4-5-20250929',
        pathToClaudeCodeExecutable: claudePath,
        allowedTools: session.config.allowedTools,
        cwd: session.config.workingDirectory,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        includePartialMessages: true,
        stderr: (data: string) => {
          console.error('[SDK stderr]', data.trim())
        }
      }

      if (session.config.systemPrompt) {
        options.systemPrompt = session.config.systemPrompt
      }

      if (session.sdkSessionId) {
        options.resume = session.sdkSessionId
      }

      const stream = query({
        prompt: params.content,
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
    }
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
