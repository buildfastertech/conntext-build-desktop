import Anthropic from '@anthropic-ai/sdk'
import type { StreamEvent } from './agent-service'

export class VisionService {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async sendMessageWithVision(
    params: {
      content: string
      images: Array<{ data: string; mediaType: string }>
      workingDirectory: string
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | any[] }>
    },
    onEvent: (event: StreamEvent) => void
  ): Promise<{ success: boolean }> {
    try {
      console.log('[VisionService] Sending message with', params.images.length, 'images')

      // Build the message content with images
      const messageContent: any[] = [
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

      // Build conversation history
      const messages: Anthropic.MessageParam[] = [
        ...(params.conversationHistory || []),
        {
          role: 'user',
          content: messageContent
        }
      ]

      // Create the stream
      const stream = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages,
        stream: true,
        system: `You are a helpful AI assistant with vision capabilities. You can see and analyze images that the user shares with you.

Current working directory: ${params.workingDirectory}

When discussing code or files, keep in mind the user's working directory context.`
      })

      let fullResponse = ''

      // Process the stream
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            onEvent({
              event: 'system',
              data: {
                model: event.message.model,
                type: 'vision_mode'
              }
            })
            break

          case 'content_block_start':
            // Content block starting
            break

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const text = event.delta.text
              fullResponse += text
              onEvent({
                event: 'text',
                data: { text }
              })
            }
            break

          case 'content_block_stop':
            // Content block finished
            break

          case 'message_delta':
            // Message metadata update
            break

          case 'message_stop':
            onEvent({
              event: 'done',
              data: {
                sessionId: null, // Vision service doesn't use persistent sessions
                sdkSessionId: null,
                subtype: 'success',
                isError: false,
                numTurns: 1,
                costUsd: 0, // Could calculate based on usage if needed
                result: fullResponse
              }
            })
            break
        }
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[VisionService] Error:', errorMessage)
      onEvent({
        event: 'error',
        data: { error: errorMessage }
      })
      return { success: false }
    }
  }
}
