import Pusher from 'pusher-js'

interface WebSocketConfig {
  apiUrl: string
  apiToken: string
  key: string
  host: string
  port: number
  scheme: string
}

type EventCallback = (event: { type: string; action: string; data: Record<string, unknown> }) => void

/**
 * Manages a Pusher/Reverb WebSocket connection for receiving
 * real-time workspace events from the ConnText Laravel backend.
 */
export class WebSocketService {
  private pusher: Pusher | null = null
  private subscribedChannels: Map<string, ReturnType<Pusher['subscribe']>> = new Map()
  private eventCallback: EventCallback | null = null
  private currentWorkspaceId: string | null = null

  /**
   * Connect to the Reverb WebSocket server and subscribe to workspace events.
   */
  async connect(
    config: WebSocketConfig,
    workspaceId: string,
    onEvent: EventCallback
  ): Promise<{ success: boolean; error?: string }> {
    // Disconnect existing connection if any
    this.disconnect()

    this.eventCallback = onEvent
    this.currentWorkspaceId = workspaceId

    try {
      // Fetch broadcasting config from the API
      const configResponse = await fetch(`${config.apiUrl}/api/broadcasting/config`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.apiToken}`
        }
      })

      let wsConfig = {
        key: config.key,
        host: config.host,
        port: config.port,
        scheme: config.scheme
      }

      if (configResponse.ok) {
        const remoteConfig = await configResponse.json()
        console.log('[WebSocket] Remote broadcasting config:', JSON.stringify(remoteConfig))
        wsConfig = {
          key: remoteConfig.key || wsConfig.key,
          host: remoteConfig.host || wsConfig.host,
          port: remoteConfig.port || wsConfig.port,
          scheme: remoteConfig.scheme || wsConfig.scheme
        }
      } else {
        console.warn('[WebSocket] Failed to fetch broadcasting config:', configResponse.status, configResponse.statusText)
      }

      console.log('[WebSocket] Connecting with config:', JSON.stringify(wsConfig))

      const forceTLS = wsConfig.scheme === 'https'

      this.pusher = new Pusher(wsConfig.key, {
        wsHost: wsConfig.host,
        wsPort: forceTLS ? undefined : wsConfig.port,
        wssPort: forceTLS ? wsConfig.port : undefined,
        forceTLS,
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        // Custom authorizer for private channels using Bearer token
        authorizer: (channel) => ({
          authorize: async (socketId, callback) => {
            try {
              const response = await fetch(`${config.apiUrl}/api/broadcasting/auth`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  Authorization: `Bearer ${config.apiToken}`
                },
                body: JSON.stringify({
                  socket_id: socketId,
                  channel_name: channel.name
                })
              })

              if (!response.ok) {
                callback(new Error(`Auth failed: ${response.statusText}`), null as any)
                return
              }

              const data = await response.json()
              callback(null, data)
            } catch (error) {
              callback(error as Error, null as any)
            }
          }
        })
      })

      // Connection state logging
      this.pusher.connection.bind('connected', () => {
        console.log('[WebSocket] Connected to Reverb')
      })

      this.pusher.connection.bind('error', (err: any) => {
        console.error('[WebSocket] Connection error:', err)
      })

      this.pusher.connection.bind('disconnected', () => {
        console.log('[WebSocket] Disconnected from Reverb')
      })

      // Subscribe to workspace channel for cross-board updates
      this.subscribeToWorkspace(workspaceId)

      return { success: true }
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Subscribe to a workspace's private channel.
   */
  private subscribeToWorkspace(workspaceId: string): void {
    if (!this.pusher) return

    const channelName = `private-workspace.${workspaceId}`

    if (this.subscribedChannels.has(channelName)) return

    const channel = this.pusher.subscribe(channelName)

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[WebSocket] Subscribed to ${channelName}`)
    })

    channel.bind('pusher:subscription_error', (err: any) => {
      console.error(`[WebSocket] Subscription error for ${channelName}:`, err)
    })

    // Listen for WorkspaceDataUpdated events
    channel.bind('WorkspaceDataUpdated', (data: any) => {
      console.log('[WebSocket] WorkspaceDataUpdated:', data)
      this.eventCallback?.({
        type: data.type || 'unknown',
        action: data.action || 'updated',
        data
      })
    })

    this.subscribedChannels.set(channelName, channel)
  }

  /**
   * Subscribe to a specific task board channel for detailed task updates.
   */
  subscribeToTaskBoard(taskBoardId: string): void {
    if (!this.pusher) return

    const channelName = `private-task-board.${taskBoardId}`

    if (this.subscribedChannels.has(channelName)) return

    const channel = this.pusher.subscribe(channelName)

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[WebSocket] Subscribed to ${channelName}`)
    })

    channel.bind('TaskBoardUpdated', (data: any) => {
      console.log('[WebSocket] TaskBoardUpdated:', data)
      this.eventCallback?.({
        type: 'task',
        action: data.action || 'updated',
        data
      })
    })

    this.subscribedChannels.set(channelName, channel)
  }

  /**
   * Subscribe to a service desk channel for ticket updates.
   */
  subscribeToServiceDesk(serviceDeskId: string): void {
    if (!this.pusher) return

    const channelName = `private-service-desk.${serviceDeskId}`

    if (this.subscribedChannels.has(channelName)) return

    const channel = this.pusher.subscribe(channelName)

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[WebSocket] Subscribed to ${channelName}`)
    })

    channel.bind('TicketBoardUpdated', (data: any) => {
      console.log('[WebSocket] TicketBoardUpdated:', data)
      this.eventCallback?.({
        type: 'ticket',
        action: data.action || 'updated',
        data
      })
    })

    this.subscribedChannels.set(channelName, channel)
  }

  /**
   * Disconnect from the WebSocket server and clean up all subscriptions.
   */
  disconnect(): void {
    if (this.pusher) {
      for (const [channelName] of this.subscribedChannels) {
        this.pusher.unsubscribe(channelName)
      }
      this.subscribedChannels.clear()
      this.pusher.disconnect()
      this.pusher = null
      console.log('[WebSocket] Disconnected and cleaned up')
    }
    this.eventCallback = null
    this.currentWorkspaceId = null
  }

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this.pusher?.connection.state === 'connected'
  }

  /**
   * Get the current workspace ID being listened to.
   */
  getCurrentWorkspaceId(): string | null {
    return this.currentWorkspaceId
  }
}
