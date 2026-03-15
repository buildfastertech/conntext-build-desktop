import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock all heavy dependencies before importing AgentService
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
  tool: vi.fn().mockReturnValue({}),
  createSdkMcpServer: vi.fn().mockReturnValue({})
}))

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('/usr/bin/claude\n')
}))

vi.mock('../../src/main/vision-service', () => ({
  VisionService: vi.fn()
}))

vi.mock('../../src/main/tools', () => ({
  customToolsServer: null
}))

vi.mock('../../src/main/tools/ask-user', () => ({
  addQuestionNotifier: vi.fn(),
  removeQuestionNotifier: vi.fn(),
  askUserTool: {}
}))

vi.mock('../../src/main/tools/code-review', () => ({
  codeReviewTool: {}
}))

import { AgentService } from '../../src/main/agent-service'

describe('AgentService — Session Management', () => {
  let service: AgentService

  beforeEach(() => {
    service = new AgentService()
  })

  // ─── Session Creation and Tracking ────────────────────────────────

  describe('createSession()', () => {
    it('returns a session ID', () => {
      const result = service.createSession({ workingDirectory: '/tmp/project' })
      expect(result).toHaveProperty('sessionId')
      expect(typeof result.sessionId).toBe('string')
    })

    it('creates multiple sessions with different IDs', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })
      const c = service.createSession({ workingDirectory: '/tmp/c' })

      expect(a.sessionId).not.toBe(b.sessionId)
      expect(b.sessionId).not.toBe(c.sessionId)
      expect(a.sessionId).not.toBe(c.sessionId)
    })

    it('tracks created sessions in the internal map', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })
      const info = service.getSessionInfo(sessionId)

      expect(info).not.toBeNull()
      expect(info!.id).toBe(sessionId)
      expect(info!.workingDirectory).toBe('/tmp/project')
    })

    it('uses default tools when none are provided', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })
      const info = service.getSessionInfo(sessionId)

      expect(info!.allowedTools).toContain('Read')
      expect(info!.allowedTools).toContain('Write')
      expect(info!.allowedTools).toContain('Bash')
    })

    it('uses custom tools when provided', () => {
      const { sessionId } = service.createSession({
        workingDirectory: '/tmp/project',
        allowedTools: ['Read', 'Grep']
      })
      const info = service.getSessionInfo(sessionId)

      expect(info!.allowedTools).toEqual(['Read', 'Grep'])
    })

    it('sets initial state correctly', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })
      const info = service.getSessionInfo(sessionId)

      expect(info!.sdkSessionId).toBeNull()
      expect(info!.isProcessing).toBe(false)
      expect(info!.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('createDefaultSession()', () => {
    it('creates a session with only a working directory', () => {
      const { sessionId } = service.createDefaultSession('/tmp/default')
      const info = service.getSessionInfo(sessionId)

      expect(info).not.toBeNull()
      expect(info!.workingDirectory).toBe('/tmp/default')
    })
  })

  describe('listActiveSessions()', () => {
    it('returns an empty array when no sessions exist', () => {
      expect(service.listActiveSessions()).toEqual([])
    })

    it('returns all created sessions', () => {
      service.createSession({ workingDirectory: '/tmp/a' })
      service.createSession({ workingDirectory: '/tmp/b' })
      service.createSession({ workingDirectory: '/tmp/c' })

      const sessions = service.listActiveSessions()
      expect(sessions).toHaveLength(3)

      const dirs = sessions.map(s => s.workingDirectory)
      expect(dirs).toContain('/tmp/a')
      expect(dirs).toContain('/tmp/b')
      expect(dirs).toContain('/tmp/c')
    })
  })

  describe('getSessionInfo()', () => {
    it('returns correct details for a session', () => {
      const { sessionId } = service.createSession({
        workingDirectory: '/tmp/project',
        allowedTools: ['Read']
      })

      const info = service.getSessionInfo(sessionId)
      expect(info).toEqual({
        id: sessionId,
        sdkSessionId: null,
        workingDirectory: '/tmp/project',
        createdAt: expect.any(Date),
        allowedTools: ['Read'],
        isProcessing: false
      })
    })

    it('returns null for a non-existent session', () => {
      expect(service.getSessionInfo('non-existent-id')).toBeNull()
    })
  })

  // ─── Unique ID Generation ────────────────────────────────────────

  describe('session ID uniqueness', () => {
    it('generates 100 unique session IDs', () => {
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const { sessionId } = service.createSession({ workingDirectory: `/tmp/project-${i}` })
        ids.add(sessionId)
      }

      expect(ids.size).toBe(100)
    })

    it('generates valid UUID v4 format IDs', () => {
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })

      expect(sessionId).toMatch(uuidV4Regex)
    })
  })

  // ─── Active Session Management ────────────────────────────────────

  describe('setActiveSession()', () => {
    it('sets the active session when ID is valid', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })
      const result = service.setActiveSession(sessionId)

      expect(result).toEqual({ success: true })
    })

    it('fails gracefully with an invalid session ID', () => {
      const result = service.setActiveSession('does-not-exist')
      expect(result).toEqual({ success: false })
    })
  })

  describe('getActiveSession()', () => {
    it('returns null when no active session is set', () => {
      expect(service.getActiveSession()).toBeNull()
    })

    it('returns the active session info after setting it', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/active' })
      service.setActiveSession(sessionId)

      const active = service.getActiveSession()
      expect(active).not.toBeNull()
      expect(active!.id).toBe(sessionId)
      expect(active!.workingDirectory).toBe('/tmp/active')
    })

    it('returns the most recently set active session', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })

      service.setActiveSession(a.sessionId)
      service.setActiveSession(b.sessionId)

      const active = service.getActiveSession()
      expect(active!.id).toBe(b.sessionId)
    })
  })

  describe('destroySession()', () => {
    it('removes the session from the map', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })
      service.destroySession(sessionId)

      expect(service.getSessionInfo(sessionId)).toBeNull()
      expect(service.listActiveSessions()).toHaveLength(0)
    })

    it('clears the active session if the destroyed session was active', () => {
      const { sessionId } = service.createSession({ workingDirectory: '/tmp/project' })
      service.setActiveSession(sessionId)
      service.destroySession(sessionId)

      expect(service.getActiveSession()).toBeNull()
    })

    it('does not clear the active session if a different session was destroyed', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })
      service.setActiveSession(a.sessionId)

      service.destroySession(b.sessionId)

      const active = service.getActiveSession()
      expect(active).not.toBeNull()
      expect(active!.id).toBe(a.sessionId)
    })

    it('returns success even for non-existent sessions', () => {
      const result = service.destroySession('non-existent')
      expect(result).toEqual({ success: true })
    })
  })

  // ─── Data Isolation ───────────────────────────────────────────────

  describe('session data isolation', () => {
    it('sessions have independent configurations', () => {
      const a = service.createSession({
        workingDirectory: '/tmp/a',
        allowedTools: ['Read']
      })
      const b = service.createSession({
        workingDirectory: '/tmp/b',
        allowedTools: ['Write', 'Edit']
      })

      const infoA = service.getSessionInfo(a.sessionId)
      const infoB = service.getSessionInfo(b.sessionId)

      expect(infoA!.workingDirectory).toBe('/tmp/a')
      expect(infoA!.allowedTools).toEqual(['Read'])

      expect(infoB!.workingDirectory).toBe('/tmp/b')
      expect(infoB!.allowedTools).toEqual(['Write', 'Edit'])
    })

    it('destroying one session does not affect another', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })

      service.destroySession(a.sessionId)

      expect(service.getSessionInfo(a.sessionId)).toBeNull()
      expect(service.getSessionInfo(b.sessionId)).not.toBeNull()
      expect(service.listActiveSessions()).toHaveLength(1)
      expect(service.listActiveSessions()[0].id).toBe(b.sessionId)
    })

    it('each session has its own creation timestamp', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })

      const infoA = service.getSessionInfo(a.sessionId)
      const infoB = service.getSessionInfo(b.sessionId)

      // Both should have valid dates, and B should be same or after A
      expect(infoA!.createdAt.getTime()).toBeLessThanOrEqual(infoB!.createdAt.getTime())
    })

    it('each session starts with independent processing state', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })

      const infoA = service.getSessionInfo(a.sessionId)
      const infoB = service.getSessionInfo(b.sessionId)

      expect(infoA!.isProcessing).toBe(false)
      expect(infoB!.isProcessing).toBe(false)
    })
  })
})
