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

describe('Integration: Multi-Session Workflows', () => {
  let service: AgentService

  beforeEach(() => {
    service = new AgentService()
  })

  // ─── Full User Flow Simulation ───────────────────────────────────
  // Simulates clicking '+' to create sessions, verifying they appear
  // in the selector, switching between them, and confirming data isolation.

  describe('full user flow: create, list, switch, and isolate', () => {
    it('simulates the complete multi-session lifecycle', () => {
      // Step 1: User starts with no sessions
      expect(service.listActiveSessions()).toHaveLength(0)
      expect(service.getActiveSession()).toBeNull()

      // Step 2: User clicks '+' to create Session A (project-alpha)
      const sessionA = service.createSession({
        workingDirectory: '/home/user/project-alpha',
        allowedTools: ['Read', 'Write', 'Bash']
      })
      service.setActiveSession(sessionA.sessionId)

      // Verify Session A is active and in the selector list
      expect(service.listActiveSessions()).toHaveLength(1)
      expect(service.getActiveSession()!.id).toBe(sessionA.sessionId)
      expect(service.getActiveSession()!.workingDirectory).toBe('/home/user/project-alpha')

      // Step 3: User clicks '+' again to create Session B (project-beta)
      const sessionB = service.createSession({
        workingDirectory: '/home/user/project-beta',
        allowedTools: ['Read', 'Grep']
      })

      // Verify both sessions are in the selector
      const sessionsAfterB = service.listActiveSessions()
      expect(sessionsAfterB).toHaveLength(2)
      const sessionIds = sessionsAfterB.map(s => s.id)
      expect(sessionIds).toContain(sessionA.sessionId)
      expect(sessionIds).toContain(sessionB.sessionId)

      // Session A should still be active (creating B doesn't switch)
      expect(service.getActiveSession()!.id).toBe(sessionA.sessionId)

      // Step 4: User clicks Session B in the selector to switch
      service.setActiveSession(sessionB.sessionId)
      expect(service.getActiveSession()!.id).toBe(sessionB.sessionId)
      expect(service.getActiveSession()!.workingDirectory).toBe('/home/user/project-beta')

      // Step 5: Confirm data isolation — Session A's config is unchanged
      const infoA = service.getSessionInfo(sessionA.sessionId)
      expect(infoA!.workingDirectory).toBe('/home/user/project-alpha')
      expect(infoA!.allowedTools).toEqual(['Read', 'Write', 'Bash'])

      const infoB = service.getSessionInfo(sessionB.sessionId)
      expect(infoB!.workingDirectory).toBe('/home/user/project-beta')
      expect(infoB!.allowedTools).toEqual(['Read', 'Grep'])

      // Step 6: Switch back to A and verify it retained its state
      service.setActiveSession(sessionA.sessionId)
      expect(service.getActiveSession()!.id).toBe(sessionA.sessionId)
      expect(service.getActiveSession()!.workingDirectory).toBe('/home/user/project-alpha')
      expect(service.getActiveSession()!.allowedTools).toEqual(['Read', 'Write', 'Bash'])
    })

    it('maintains session list integrity after destroying one session', () => {
      const a = service.createSession({ workingDirectory: '/tmp/a' })
      const b = service.createSession({ workingDirectory: '/tmp/b' })
      const c = service.createSession({ workingDirectory: '/tmp/c' })

      service.setActiveSession(b.sessionId)

      // Destroy session A — should not affect B (active) or C
      service.destroySession(a.sessionId)

      expect(service.listActiveSessions()).toHaveLength(2)
      expect(service.getActiveSession()!.id).toBe(b.sessionId)
      expect(service.getSessionInfo(a.sessionId)).toBeNull()
      expect(service.getSessionInfo(c.sessionId)).not.toBeNull()
    })
  })

  // ─── Inactive Session Isolation ──────────────────────────────────
  // Verifies that actions on one session do not bleed into another.

  describe('inactive session isolation', () => {
    it('destroying the active session does not corrupt inactive sessions', () => {
      const a = service.createSession({
        workingDirectory: '/projects/a',
        allowedTools: ['Read']
      })
      const b = service.createSession({
        workingDirectory: '/projects/b',
        allowedTools: ['Write', 'Edit']
      })
      const c = service.createSession({
        workingDirectory: '/projects/c',
        allowedTools: ['Bash']
      })

      service.setActiveSession(a.sessionId)

      // Destroy the active session
      service.destroySession(a.sessionId)

      // Active session should be cleared
      expect(service.getActiveSession()).toBeNull()

      // Remaining sessions should be completely intact
      const infoB = service.getSessionInfo(b.sessionId)
      expect(infoB!.workingDirectory).toBe('/projects/b')
      expect(infoB!.allowedTools).toEqual(['Write', 'Edit'])
      expect(infoB!.isProcessing).toBe(false)

      const infoC = service.getSessionInfo(c.sessionId)
      expect(infoC!.workingDirectory).toBe('/projects/c')
      expect(infoC!.allowedTools).toEqual(['Bash'])
    })

    it('creating a new session does not alter existing session state', () => {
      const existing = service.createSession({
        workingDirectory: '/projects/existing',
        allowedTools: ['Read', 'Write']
      })
      service.setActiveSession(existing.sessionId)

      // Capture existing session state before creating new one
      const beforeInfo = service.getSessionInfo(existing.sessionId)
      const beforeCreatedAt = beforeInfo!.createdAt

      // Create several new sessions
      service.createSession({ workingDirectory: '/projects/new-1' })
      service.createSession({ workingDirectory: '/projects/new-2' })
      service.createSession({ workingDirectory: '/projects/new-3' })

      // Existing session should be completely unchanged
      const afterInfo = service.getSessionInfo(existing.sessionId)
      expect(afterInfo!.workingDirectory).toBe('/projects/existing')
      expect(afterInfo!.allowedTools).toEqual(['Read', 'Write'])
      expect(afterInfo!.createdAt).toBe(beforeCreatedAt)
      expect(afterInfo!.isProcessing).toBe(false)
      expect(afterInfo!.sdkSessionId).toBeNull()

      // Active session should still be the original
      expect(service.getActiveSession()!.id).toBe(existing.sessionId)
    })

    it('switching active session does not modify the previously active session', () => {
      const a = service.createSession({
        workingDirectory: '/projects/a',
        allowedTools: ['Read']
      })
      const b = service.createSession({
        workingDirectory: '/projects/b',
        allowedTools: ['Write']
      })

      service.setActiveSession(a.sessionId)

      // Capture A's full state
      const aStateBefore = service.getSessionInfo(a.sessionId)

      // Switch to B
      service.setActiveSession(b.sessionId)

      // A's state should be identical
      const aStateAfter = service.getSessionInfo(a.sessionId)
      expect(aStateAfter).toEqual(aStateBefore)
    })

    it('destroying an inactive session does not affect the active session view', () => {
      const active = service.createSession({ workingDirectory: '/projects/active' })
      const inactive = service.createSession({ workingDirectory: '/projects/inactive' })

      service.setActiveSession(active.sessionId)
      const activeStateBefore = service.getSessionInfo(active.sessionId)

      // Destroy the inactive session
      service.destroySession(inactive.sessionId)

      // Active session should be identical
      const activeStateAfter = service.getSessionInfo(active.sessionId)
      expect(activeStateAfter).toEqual(activeStateBefore)
      expect(service.getActiveSession()!.id).toBe(active.sessionId)
    })
  })

  // ─── Performance with 5+ Sessions ───────────────────────────────
  // Creates 10 sessions and verifies operations complete promptly.

  describe('performance with many sessions', () => {
    it('handles 10 sessions without performance regression', () => {
      const sessionIds: string[] = []

      // Create 10 sessions
      const createStart = performance.now()
      for (let i = 0; i < 10; i++) {
        const { sessionId } = service.createSession({
          workingDirectory: `/projects/session-${i}`,
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']
        })
        sessionIds.push(sessionId)
      }
      const createDuration = performance.now() - createStart
      expect(createDuration).toBeLessThan(100)

      // listActiveSessions returns all 10
      const listStart = performance.now()
      const allSessions = service.listActiveSessions()
      const listDuration = performance.now() - listStart

      expect(allSessions).toHaveLength(10)
      expect(listDuration).toBeLessThan(100)

      // getSessionInfo works correctly for each
      const infoStart = performance.now()
      for (let i = 0; i < 10; i++) {
        const info = service.getSessionInfo(sessionIds[i])
        expect(info).not.toBeNull()
        expect(info!.workingDirectory).toBe(`/projects/session-${i}`)
        expect(info!.id).toBe(sessionIds[i])
      }
      const infoDuration = performance.now() - infoStart
      expect(infoDuration).toBeLessThan(100)

      // Switching between sessions is fast
      const switchStart = performance.now()
      for (const id of sessionIds) {
        service.setActiveSession(id)
        expect(service.getActiveSession()!.id).toBe(id)
      }
      const switchDuration = performance.now() - switchStart
      expect(switchDuration).toBeLessThan(100)
    })

    it('maintains data integrity across 10 sessions with unique configs', () => {
      const configs = Array.from({ length: 10 }, (_, i) => ({
        workingDirectory: `/workspace/project-${i}`,
        allowedTools: i % 2 === 0 ? ['Read', 'Write'] : ['Bash', 'Grep', 'Glob']
      }))

      const sessionIds = configs.map(config => service.createSession(config).sessionId)

      // Verify each session has its own distinct config
      for (let i = 0; i < 10; i++) {
        const info = service.getSessionInfo(sessionIds[i])
        expect(info!.workingDirectory).toBe(configs[i].workingDirectory)
        expect(info!.allowedTools).toEqual(configs[i].allowedTools)
      }

      // Verify session list contains all 10
      const allSessions = service.listActiveSessions()
      expect(allSessions).toHaveLength(10)
      const allDirs = allSessions.map(s => s.workingDirectory).sort()
      const expectedDirs = configs.map(c => c.workingDirectory).sort()
      expect(allDirs).toEqual(expectedDirs)
    })

    it('handles rapid creation and destruction cycles', () => {
      // Create 10 sessions
      const ids = Array.from({ length: 10 }, (_, i) =>
        service.createSession({ workingDirectory: `/tmp/rapid-${i}` }).sessionId
      )
      expect(service.listActiveSessions()).toHaveLength(10)

      // Destroy every other session
      for (let i = 0; i < 10; i += 2) {
        service.destroySession(ids[i])
      }
      expect(service.listActiveSessions()).toHaveLength(5)

      // Remaining sessions should be the odd-indexed ones
      for (let i = 1; i < 10; i += 2) {
        const info = service.getSessionInfo(ids[i])
        expect(info).not.toBeNull()
        expect(info!.workingDirectory).toBe(`/tmp/rapid-${i}`)
      }

      // Destroyed sessions should be gone
      for (let i = 0; i < 10; i += 2) {
        expect(service.getSessionInfo(ids[i])).toBeNull()
      }
    })
  })

  // ─── Session Switching State Loading ─────────────────────────────
  // Verifies that switching sessions correctly loads the full state.

  describe('session switching loads correct state', () => {
    it('switching between two sessions returns the correct full state each time', () => {
      const sessionA = service.createSession({
        workingDirectory: '/home/user/frontend',
        allowedTools: ['Read', 'Write', 'Edit']
      })
      const sessionB = service.createSession({
        workingDirectory: '/home/user/backend',
        allowedTools: ['Bash', 'Grep']
      })

      // Switch to A, verify complete state
      service.setActiveSession(sessionA.sessionId)
      let active = service.getActiveSession()!
      expect(active.id).toBe(sessionA.sessionId)
      expect(active.workingDirectory).toBe('/home/user/frontend')
      expect(active.allowedTools).toEqual(['Read', 'Write', 'Edit'])
      expect(active.sdkSessionId).toBeNull()
      expect(active.isProcessing).toBe(false)
      expect(active.createdAt).toBeInstanceOf(Date)

      // Switch to B, verify complete state
      service.setActiveSession(sessionB.sessionId)
      active = service.getActiveSession()!
      expect(active.id).toBe(sessionB.sessionId)
      expect(active.workingDirectory).toBe('/home/user/backend')
      expect(active.allowedTools).toEqual(['Bash', 'Grep'])
      expect(active.sdkSessionId).toBeNull()
      expect(active.isProcessing).toBe(false)
      expect(active.createdAt).toBeInstanceOf(Date)

      // Switch back to A again, verify state still correct
      service.setActiveSession(sessionA.sessionId)
      active = service.getActiveSession()!
      expect(active.id).toBe(sessionA.sessionId)
      expect(active.workingDirectory).toBe('/home/user/frontend')
      expect(active.allowedTools).toEqual(['Read', 'Write', 'Edit'])
    })

    it('rapid back-and-forth switching preserves state integrity', () => {
      const sessions = Array.from({ length: 5 }, (_, i) =>
        service.createSession({
          workingDirectory: `/projects/p${i}`,
          allowedTools: [`Tool${i}`]
        })
      )

      // Rapidly switch between all sessions multiple times
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 5; i++) {
          service.setActiveSession(sessions[i].sessionId)
          const active = service.getActiveSession()!
          expect(active.id).toBe(sessions[i].sessionId)
          expect(active.workingDirectory).toBe(`/projects/p${i}`)
          expect(active.allowedTools).toEqual([`Tool${i}`])
        }
      }
    })

    it('getActiveSession returns null after the active session is destroyed', () => {
      const session = service.createSession({ workingDirectory: '/tmp/test' })
      service.setActiveSession(session.sessionId)

      expect(service.getActiveSession()).not.toBeNull()

      service.destroySession(session.sessionId)

      expect(service.getActiveSession()).toBeNull()
    })

    it('switching to a newly created session after destroying the active one works correctly', () => {
      const a = service.createSession({ workingDirectory: '/projects/a' })
      const b = service.createSession({ workingDirectory: '/projects/b' })

      service.setActiveSession(a.sessionId)
      service.destroySession(a.sessionId)

      // After destroying A, switch to B
      const result = service.setActiveSession(b.sessionId)
      expect(result).toEqual({ success: true })

      const active = service.getActiveSession()!
      expect(active.id).toBe(b.sessionId)
      expect(active.workingDirectory).toBe('/projects/b')
    })
  })
})
