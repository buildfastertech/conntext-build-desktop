import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

let tempDir: string

vi.mock('electron', () => ({
  app: {
    getPath: () => tempDir
  }
}))

import { SkillsStore, MetadataFile } from '../../src/main/skills-store'

// Helper to create a mock fetch Response
function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
    bytes: async () => new Uint8Array()
  } as Response
}

const API_URL = 'https://conntext.test'
const API_TOKEN = 'integration-test-token'

describe('Integration: Skills Sync', () => {
  let store: SkillsStore
  let skillsDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'skills-int-'))
    skillsDir = join(tempDir, 'skills')
    store = new SkillsStore()
    await store.ensureSkillsDirectory()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── Initial Sync Flow ────────────────────────────────────────────

  describe('initial sync (empty state -> full download)', () => {
    it('downloads all skills, creates files, and writes correct metadata', async () => {
      const remoteSkills = [
        { id: 'skill-a', title: 'Architecture Review', version_number: 2 },
        { id: 'skill-b', title: 'Feature Build', version_number: 5 },
        { id: 'skill-c', title: 'Bug Triage', version_number: 1 }
      ]

      const skillContents: Record<string, string> = {
        'skill-a': '# Architecture Review\n\nReview the architecture of the codebase.',
        'skill-b': '# Feature Build\n\nBuild features step by step.',
        'skill-c': '# Bug Triage\n\nTriage and prioritise bugs.'
      }

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/api/skills')) {
          return mockResponse({ skills: remoteSkills })
        }
        for (const skill of remoteSkills) {
          if (url.endsWith(`/api/skills/${skill.id}`)) {
            return mockResponse({
              ...skill,
              content: skillContents[skill.id]
            })
          }
        }
        return mockResponse({}, 404, 'Not Found')
      })
      vi.stubGlobal('fetch', mockFetch)

      // Verify no metadata exists before sync
      expect(await store.needsInitialSync()).toBe(true)

      const result = await store.syncSkills(API_URL, API_TOKEN)

      // Verify sync result
      expect(result.success).toBe(true)
      expect(result.count).toBe(3)
      expect(result.updated).toBe(true)
      expect(result.partialFailure).toBeUndefined()

      // Verify all skill files were created with correct content
      for (const skill of remoteSkills) {
        const filePath = join(skillsDir, `${skill.title}.md`)
        expect(existsSync(filePath)).toBe(true)
        const content = await readFile(filePath, 'utf-8')
        expect(content).toBe(skillContents[skill.id])
      }

      // Verify metadata was written correctly
      const metadata = await store.readMetadata()
      expect(metadata).not.toBeNull()
      expect(metadata!.global_version).toBe(5) // max version_number
      expect(metadata!.last_sync).toBeTruthy()
      expect(Object.keys(metadata!.skills)).toHaveLength(3)

      // Verify each skill entry in metadata
      expect(metadata!.skills['skill-a']).toEqual({
        id: 'skill-a',
        title: 'Architecture Review',
        version_number: 2
      })
      expect(metadata!.skills['skill-b']).toEqual({
        id: 'skill-b',
        title: 'Feature Build',
        version_number: 5
      })
      expect(metadata!.skills['skill-c']).toEqual({
        id: 'skill-c',
        title: 'Bug Triage',
        version_number: 1
      })

      // Verify no longer needs initial sync
      expect(await store.needsInitialSync()).toBe(false)

      // Verify fetch was called the right number of times:
      // 1 for index + 3 for individual skills = 4
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
  })

  // ─── Update Sync Flow ─────────────────────────────────────────────

  describe('update sync (version mismatch -> adds/updates/deletes)', () => {
    it('correctly adds new skills, updates changed skills, deletes removed skills, and renames on title change', async () => {
      // Setup existing local state
      const existingMetadata: MetadataFile = {
        global_version: 3,
        last_sync: '2026-03-01T00:00:00.000Z',
        skills: {
          'skill-keep': { id: 'skill-keep', title: 'Keep Unchanged', version_number: 2 },
          'skill-update': { id: 'skill-update', title: 'Needs Update', version_number: 1 },
          'skill-rename': { id: 'skill-rename', title: 'Old Name', version_number: 1 },
          'skill-delete': { id: 'skill-delete', title: 'To Be Deleted', version_number: 1 }
        }
      }

      await store.writeMetadata(existingMetadata)
      await writeFile(join(skillsDir, 'Keep Unchanged.md'), 'keep content', 'utf-8')
      await writeFile(join(skillsDir, 'Needs Update.md'), 'old update content', 'utf-8')
      await writeFile(join(skillsDir, 'Old Name.md'), 'rename content', 'utf-8')
      await writeFile(join(skillsDir, 'To Be Deleted.md'), 'delete content', 'utf-8')

      // Remote state: skill-keep unchanged, skill-update version bumped,
      // skill-rename title changed, skill-delete removed, skill-new added
      const remoteSkills = [
        { id: 'skill-keep', title: 'Keep Unchanged', version_number: 2 },
        { id: 'skill-update', title: 'Needs Update', version_number: 3 },
        { id: 'skill-rename', title: 'New Name', version_number: 1 },
        { id: 'skill-new', title: 'Brand New Skill', version_number: 1 }
      ]

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/api/skills')) {
          return mockResponse({ skills: remoteSkills })
        }
        if (url.endsWith('/api/skills/skill-update')) {
          return mockResponse({
            id: 'skill-update', title: 'Needs Update', version_number: 3,
            content: 'updated content'
          })
        }
        if (url.endsWith('/api/skills/skill-rename')) {
          return mockResponse({
            id: 'skill-rename', title: 'New Name', version_number: 1,
            content: 'rename content'
          })
        }
        if (url.endsWith('/api/skills/skill-new')) {
          return mockResponse({
            id: 'skill-new', title: 'Brand New Skill', version_number: 1,
            content: 'brand new content'
          })
        }
        return mockResponse({}, 404, 'Not Found')
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.syncSkills(API_URL, API_TOKEN)

      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)
      expect(result.count).toBe(4) // keep + update + rename + new

      // Verify: skill-keep unchanged
      expect(existsSync(join(skillsDir, 'Keep Unchanged.md'))).toBe(true)
      const keepContent = await readFile(join(skillsDir, 'Keep Unchanged.md'), 'utf-8')
      expect(keepContent).toBe('keep content')

      // Verify: skill-update content updated
      const updateContent = await readFile(join(skillsDir, 'Needs Update.md'), 'utf-8')
      expect(updateContent).toBe('updated content')

      // Verify: skill-rename file renamed
      expect(existsSync(join(skillsDir, 'Old Name.md'))).toBe(false)
      expect(existsSync(join(skillsDir, 'New Name.md'))).toBe(true)

      // Verify: skill-delete removed
      expect(existsSync(join(skillsDir, 'To Be Deleted.md'))).toBe(false)

      // Verify: skill-new added
      expect(existsSync(join(skillsDir, 'Brand New Skill.md'))).toBe(true)
      const newContent = await readFile(join(skillsDir, 'Brand New Skill.md'), 'utf-8')
      expect(newContent).toBe('brand new content')

      // Verify metadata
      const metadata = await store.readMetadata()
      expect(metadata).not.toBeNull()
      expect(Object.keys(metadata!.skills)).toHaveLength(4)
      expect(metadata!.skills['skill-delete']).toBeUndefined()
      expect(metadata!.skills['skill-new']).toBeDefined()
      expect(metadata!.skills['skill-rename'].title).toBe('New Name')
      expect(metadata!.skills['skill-update'].version_number).toBe(3)
      expect(metadata!.global_version).toBe(3) // max of remote version_numbers
    })
  })

  // ─── Partial Failure ──────────────────────────────────────────────

  describe('partial failure (one skill download fails)', () => {
    it('processes other skills, metadata reflects partial state, global_version not updated', async () => {
      const remoteSkills = [
        { id: 'skill-ok', title: 'Works Fine', version_number: 2 },
        { id: 'skill-fail', title: 'Will Fail', version_number: 2 },
        { id: 'skill-also-ok', title: 'Also Works', version_number: 1 }
      ]

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/api/skills')) {
          return mockResponse({ skills: remoteSkills })
        }
        if (url.endsWith('/api/skills/skill-ok')) {
          return mockResponse({
            id: 'skill-ok', title: 'Works Fine', version_number: 2,
            content: '# Works Fine'
          })
        }
        if (url.endsWith('/api/skills/skill-fail')) {
          // Simulate a server error for this skill
          return mockResponse({}, 500, 'Internal Server Error')
        }
        if (url.endsWith('/api/skills/skill-also-ok')) {
          return mockResponse({
            id: 'skill-also-ok', title: 'Also Works', version_number: 1,
            content: '# Also Works'
          })
        }
        return mockResponse({}, 404, 'Not Found')
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.syncSkills(API_URL, API_TOKEN)

      // Should report partial failure
      expect(result.success).toBe(false)
      expect(result.partialFailure).toBe(true)
      expect(result.error).toContain('1 skill(s) failed')

      // Successful skills should have files
      expect(existsSync(join(skillsDir, 'Works Fine.md'))).toBe(true)
      expect(existsSync(join(skillsDir, 'Also Works.md'))).toBe(true)

      // Failed skill should NOT have a file
      expect(existsSync(join(skillsDir, 'Will Fail.md'))).toBe(false)

      // Metadata should contain only the successful skills
      const metadata = await store.readMetadata()
      expect(metadata).not.toBeNull()
      expect(Object.keys(metadata!.skills)).toHaveLength(2)
      expect(metadata!.skills['skill-ok']).toBeDefined()
      expect(metadata!.skills['skill-also-ok']).toBeDefined()
      expect(metadata!.skills['skill-fail']).toBeUndefined()

      // CRITICAL: global_version should NOT be updated on partial failure
      expect(metadata!.global_version).toBe(0) // was 0 (fresh), stays 0

      // last_sync should still be updated (sync did run)
      expect(metadata!.last_sync).toBeTruthy()
    })
  })

  // ─── Slash Command Flow ───────────────────────────────────────────

  describe('slash command flow (end-to-end)', () => {
    it('resolves a skill from a locally stored file', async () => {
      const skillContent = '# Feature Build\n\nYou are an expert feature builder.\n\n## Steps\n1. Analyse requirements\n2. Design solution\n3. Implement'
      await writeFile(join(skillsDir, 'feature-build.md'), skillContent, 'utf-8')

      // Simulate: user types "/feature-build", system extracts "feature-build"
      const commandName = 'feature-build'
      const content = await store.resolveSkill(commandName)

      expect(content).not.toBeNull()
      expect(content).toBe(skillContent)
      expect(content).toContain('expert feature builder')
    })

    it('returns null for a command that has no matching skill file', async () => {
      const content = await store.resolveSkill('nonexistent-command')
      expect(content).toBeNull()
    })

    it('works end-to-end: sync downloads skill, then resolve reads it', async () => {
      const remoteSkills = [
        { id: 'skill-deploy', title: 'deploy-guide', version_number: 1 }
      ]

      const deployContent = '# Deploy Guide\n\nFollow these steps to deploy safely.'

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/api/skills')) {
          return mockResponse({ skills: remoteSkills })
        }
        if (url.endsWith('/api/skills/skill-deploy')) {
          return mockResponse({
            id: 'skill-deploy', title: 'deploy-guide', version_number: 1,
            content: deployContent
          })
        }
        return mockResponse({}, 404, 'Not Found')
      })
      vi.stubGlobal('fetch', mockFetch)

      // Step 1: Sync downloads the skill
      const syncResult = await store.syncSkills(API_URL, API_TOKEN)
      expect(syncResult.success).toBe(true)

      // Step 2: Resolve the skill by command name (which matches the title)
      const content = await store.resolveSkill('deploy-guide')
      expect(content).toBe(deployContent)
    })
  })

  // ─── checkAndSync Flow ────────────────────────────────────────────

  describe('checkAndSync (version check + conditional sync)', () => {
    it('skips sync when versions match', async () => {
      await store.writeMetadata({
        global_version: 5,
        last_sync: '2026-03-01T00:00:00.000Z',
        skills: {
          'skill-1': { id: 'skill-1', title: 'Test', version_number: 5 }
        }
      })

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse({ global_version_number: 5 }))
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.checkAndSync(API_URL, API_TOKEN)

      expect(result.success).toBe(true)
      expect(result.updated).toBe(false)
      // Should only have called check-version, not the full sync
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('triggers sync when versions differ', async () => {
      await store.writeMetadata({
        global_version: 3,
        last_sync: '2026-03-01T00:00:00.000Z',
        skills: {
          'skill-1': { id: 'skill-1', title: 'Existing', version_number: 3 }
        }
      })
      await writeFile(join(skillsDir, 'Existing.md'), 'old', 'utf-8')

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/api/skills/check-version')) {
          return mockResponse({ global_version_number: 5 })
        }
        if (url.endsWith('/api/skills')) {
          return mockResponse({
            skills: [{ id: 'skill-1', title: 'Existing', version_number: 5 }]
          })
        }
        if (url.endsWith('/api/skills/skill-1')) {
          return mockResponse({
            id: 'skill-1', title: 'Existing', version_number: 5,
            content: 'updated'
          })
        }
        return mockResponse({}, 404, 'Not Found')
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.checkAndSync(API_URL, API_TOKEN)

      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)

      const content = await readFile(join(skillsDir, 'Existing.md'), 'utf-8')
      expect(content).toBe('updated')
    })
  })
})
