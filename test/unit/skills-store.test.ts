import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

// Must declare tempDir before mocking electron
let tempDir: string

vi.mock('electron', () => ({
  app: {
    getPath: () => tempDir
  }
}))

// Import after mock
import { SkillsStore, MetadataFile } from '../../src/main/skills-store'

// Helper to create a valid metadata object
function createValidMetadata(overrides: Partial<MetadataFile> = {}): MetadataFile {
  return {
    global_version: 5,
    last_sync: '2026-03-15T10:00:00.000Z',
    skills: {
      'skill-1': { id: 'skill-1', title: 'Feature Build', version_number: 3 },
      'skill-2': { id: 'skill-2', title: 'Bug Fix', version_number: 2 }
    },
    ...overrides
  }
}

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

describe('SkillsStore', () => {
  let store: SkillsStore
  let skillsDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'skills-test-'))
    skillsDir = join(tempDir, 'skills')
    store = new SkillsStore()
    // Wait for ensureSkillsDirectory to complete
    await store.ensureSkillsDirectory()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── Metadata Validation ───────────────────────────────────────────

  describe('isMetadataValid()', () => {
    it('returns true for valid metadata', () => {
      const metadata = createValidMetadata()
      expect(store.isMetadataValid(metadata)).toBe(true)
    })

    it('returns true for metadata with null last_sync', () => {
      const metadata = createValidMetadata({ last_sync: null })
      expect(store.isMetadataValid(metadata)).toBe(true)
    })

    it('returns true for metadata with empty skills object', () => {
      const metadata = createValidMetadata({ skills: {} })
      expect(store.isMetadataValid(metadata)).toBe(true)
    })

    it('returns false for null', () => {
      expect(store.isMetadataValid(null)).toBe(false)
    })

    it('returns false for non-object', () => {
      expect(store.isMetadataValid('string')).toBe(false)
      expect(store.isMetadataValid(42)).toBe(false)
      expect(store.isMetadataValid(true)).toBe(false)
    })

    it('returns false when global_version is missing', () => {
      expect(store.isMetadataValid({ last_sync: null, skills: {} })).toBe(false)
    })

    it('returns false when global_version is not an integer', () => {
      expect(store.isMetadataValid({ global_version: 1.5, last_sync: null, skills: {} })).toBe(false)
    })

    it('returns false when global_version is a string', () => {
      expect(store.isMetadataValid({ global_version: '5', last_sync: null, skills: {} })).toBe(false)
    })

    it('returns false when last_sync is a number', () => {
      expect(store.isMetadataValid({ global_version: 1, last_sync: 123, skills: {} })).toBe(false)
    })

    it('returns false when skills is null', () => {
      expect(store.isMetadataValid({ global_version: 1, last_sync: null, skills: null })).toBe(false)
    })

    it('returns false when skills is an array', () => {
      expect(store.isMetadataValid({ global_version: 1, last_sync: null, skills: [] })).toBe(false)
    })

    it('returns false when a skill entry is missing required fields', () => {
      const data = {
        global_version: 1,
        last_sync: null,
        skills: {
          'skill-1': { id: 'skill-1', title: 'Test' }
          // missing version_number
        }
      }
      expect(store.isMetadataValid(data)).toBe(false)
    })

    it('returns false when skill version_number is not an integer', () => {
      const data = {
        global_version: 1,
        last_sync: null,
        skills: {
          'skill-1': { id: 'skill-1', title: 'Test', version_number: 1.5 }
        }
      }
      expect(store.isMetadataValid(data)).toBe(false)
    })

    it('returns false when skill ID does not match its key', () => {
      const data = {
        global_version: 1,
        last_sync: null,
        skills: {
          'skill-1': { id: 'skill-WRONG', title: 'Test', version_number: 1 }
        }
      }
      expect(store.isMetadataValid(data)).toBe(false)
    })

    it('returns false when a skill entry is null', () => {
      const data = {
        global_version: 1,
        last_sync: null,
        skills: {
          'skill-1': null
        }
      }
      expect(store.isMetadataValid(data)).toBe(false)
    })
  })

  // ─── Metadata Read/Write ───────────────────────────────────────────

  describe('writeMetadata()', () => {
    it('creates metadata.json with correct content', async () => {
      const metadata = createValidMetadata()
      await store.writeMetadata(metadata)

      const raw = await readFile(join(skillsDir, 'metadata.json'), 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toEqual(metadata)
    })

    it('overwrites existing metadata', async () => {
      const first = createValidMetadata({ global_version: 1 })
      await store.writeMetadata(first)

      const second = createValidMetadata({ global_version: 10 })
      await store.writeMetadata(second)

      const raw = await readFile(join(skillsDir, 'metadata.json'), 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed.global_version).toBe(10)
    })
  })

  describe('readMetadata()', () => {
    it('reads valid metadata from disk', async () => {
      const metadata = createValidMetadata()
      await writeFile(join(skillsDir, 'metadata.json'), JSON.stringify(metadata), 'utf-8')

      const result = await store.readMetadata()
      expect(result).toEqual(metadata)
    })

    it('returns null when metadata.json does not exist', async () => {
      const result = await store.readMetadata()
      expect(result).toBeNull()
    })

    it('returns null for corrupt JSON', async () => {
      await writeFile(join(skillsDir, 'metadata.json'), '{invalid json!!!', 'utf-8')
      const result = await store.readMetadata()
      expect(result).toBeNull()
    })

    it('returns null for valid JSON with invalid structure', async () => {
      await writeFile(
        join(skillsDir, 'metadata.json'),
        JSON.stringify({ foo: 'bar' }),
        'utf-8'
      )
      const result = await store.readMetadata()
      expect(result).toBeNull()
    })

    it('returns null when skill ID does not match key', async () => {
      const bad = {
        global_version: 1,
        last_sync: null,
        skills: {
          'skill-1': { id: 'mismatched', title: 'Test', version_number: 1 }
        }
      }
      await writeFile(join(skillsDir, 'metadata.json'), JSON.stringify(bad), 'utf-8')
      const result = await store.readMetadata()
      expect(result).toBeNull()
    })
  })

  // ─── needsInitialSync ──────────────────────────────────────────────

  describe('needsInitialSync()', () => {
    it('returns true when no metadata exists', async () => {
      expect(await store.needsInitialSync()).toBe(true)
    })

    it('returns false when valid metadata exists', async () => {
      await store.writeMetadata(createValidMetadata())
      expect(await store.needsInitialSync()).toBe(false)
    })

    it('returns true when metadata is corrupt', async () => {
      await writeFile(join(skillsDir, 'metadata.json'), 'not json', 'utf-8')
      expect(await store.needsInitialSync()).toBe(true)
    })
  })

  // ─── Getters ───────────────────────────────────────────────────────

  describe('getVersion()', () => {
    it('returns the global version from metadata', async () => {
      await store.writeMetadata(createValidMetadata({ global_version: 42 }))
      expect(await store.getVersion()).toBe(42)
    })

    it('returns 0 when no metadata exists', async () => {
      expect(await store.getVersion()).toBe(0)
    })
  })

  describe('getLastSync()', () => {
    it('returns last_sync timestamp from metadata', async () => {
      const ts = '2026-03-15T12:00:00.000Z'
      await store.writeMetadata(createValidMetadata({ last_sync: ts }))
      expect(await store.getLastSync()).toBe(ts)
    })

    it('returns null when no metadata exists', async () => {
      expect(await store.getLastSync()).toBeNull()
    })
  })

  describe('getSkillCount()', () => {
    it('returns the number of skills in metadata', async () => {
      await store.writeMetadata(createValidMetadata())
      expect(await store.getSkillCount()).toBe(2)
    })

    it('returns 0 when no metadata exists', async () => {
      expect(await store.getSkillCount()).toBe(0)
    })
  })

  // ─── API Client (mocked fetch) ────────────────────────────────────

  describe('API client methods', () => {
    const apiUrl = 'https://example.com'
    const apiToken = 'test-token-123'

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    describe('checkRemoteVersion()', () => {
      it('returns version data on success', async () => {
        const responseBody = { global_version_number: 7 }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(responseBody)))

        const result = await store.checkRemoteVersion(apiUrl, apiToken)
        expect(result).toEqual({ global_version_number: 7 })
      })

      it('sends correct authorization header', async () => {
        const mockFetch = vi.fn().mockResolvedValue(mockResponse({ global_version_number: 1 }))
        vi.stubGlobal('fetch', mockFetch)

        await store.checkRemoteVersion(apiUrl, apiToken)

        expect(mockFetch).toHaveBeenCalledWith(
          `${apiUrl}/api/skills/check-version`,
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: `Bearer ${apiToken}`
            })
          })
        )
      })

      it('throws on 401 with authentication message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 401, 'Unauthorized')))

        await expect(store.checkRemoteVersion(apiUrl, apiToken)).rejects.toThrow(
          'Authentication failed - please log in again'
        )
      })

      it('throws on 403 with access denied message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 403, 'Forbidden')))

        await expect(store.checkRemoteVersion(apiUrl, apiToken)).rejects.toThrow('Access denied')
      })

      it('throws on 429 with rate limit message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 429, 'Too Many Requests')))

        await expect(store.checkRemoteVersion(apiUrl, apiToken)).rejects.toThrow(
          'Rate limited - please try again later'
        )
      })

      it('throws on other errors with status info', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 500, 'Internal Server Error')))

        await expect(store.checkRemoteVersion(apiUrl, apiToken)).rejects.toThrow(
          'API request to https://example.com/api/skills/check-version failed: 500 Internal Server Error'
        )
      })
    })

    describe('fetchSkillIndex()', () => {
      it('returns skills array on success', async () => {
        const skills = [
          { id: 'skill-1', title: 'Feature Build', version_number: 3 },
          { id: 'skill-2', title: 'Bug Fix', version_number: 1 }
        ]
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ skills })))

        const result = await store.fetchSkillIndex(apiUrl, apiToken)
        expect(result).toEqual(skills)
        expect(result).toHaveLength(2)
      })

      it('throws on 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 401, 'Unauthorized')))

        await expect(store.fetchSkillIndex(apiUrl, apiToken)).rejects.toThrow(
          'Authentication failed - please log in again'
        )
      })
    })

    describe('fetchSkillContent()', () => {
      it('returns skill with content on success', async () => {
        const skill = {
          id: 'skill-1',
          title: 'Feature Build',
          version_number: 3,
          content: '# Feature Build\n\nThis is the content.'
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(skill)))

        const result = await store.fetchSkillContent(apiUrl, apiToken, 'skill-1')
        expect(result).toEqual(skill)
        expect(result.content).toContain('Feature Build')
      })

      it('calls the correct endpoint with skill ID', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          mockResponse({ id: 'skill-abc', title: 'T', version_number: 1, content: '' })
        )
        vi.stubGlobal('fetch', mockFetch)

        await store.fetchSkillContent(apiUrl, apiToken, 'skill-abc')

        expect(mockFetch).toHaveBeenCalledWith(
          `${apiUrl}/api/skills/skill-abc`,
          expect.any(Object)
        )
      })

      it('throws on 403', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 403, 'Forbidden')))

        await expect(store.fetchSkillContent(apiUrl, apiToken, 'skill-1')).rejects.toThrow(
          'Access denied'
        )
      })
    })
  })

  // ─── Sync Logic (identification of changes) ───────────────────────

  describe('syncSkills() — change identification', () => {
    const apiUrl = 'https://example.com'
    const apiToken = 'test-token'

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('identifies skills to add (in remote, not in local)', async () => {
      // Local: no metadata (fresh start)
      // Remote: two skills
      const remoteSkills = [
        { id: 'new-1', title: 'New Skill One', version_number: 1 },
        { id: 'new-2', title: 'New Skill Two', version_number: 1 }
      ]

      const mockFetch = vi.fn()
        // fetchSkillIndex
        .mockResolvedValueOnce(mockResponse({ skills: remoteSkills }))
        // fetchSkillContent for new-1
        .mockResolvedValueOnce(
          mockResponse({ id: 'new-1', title: 'New Skill One', version_number: 1, content: '# One' })
        )
        // fetchSkillContent for new-2
        .mockResolvedValueOnce(
          mockResponse({ id: 'new-2', title: 'New Skill Two', version_number: 1, content: '# Two' })
        )
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.syncSkills(apiUrl, apiToken)

      expect(result.success).toBe(true)
      expect(result.count).toBe(2)
      expect(result.updated).toBe(true)

      // Verify files were created
      expect(existsSync(join(skillsDir, 'New Skill One.md'))).toBe(true)
      expect(existsSync(join(skillsDir, 'New Skill Two.md'))).toBe(true)
    })

    it('identifies skills to update (version changed)', async () => {
      // Local: skill-1 at version 1
      await store.writeMetadata({
        global_version: 1,
        last_sync: '2026-01-01T00:00:00.000Z',
        skills: {
          'skill-1': { id: 'skill-1', title: 'My Skill', version_number: 1 }
        }
      })
      await writeFile(join(skillsDir, 'My Skill.md'), 'old content', 'utf-8')

      // Remote: skill-1 at version 2
      const remoteSkills = [{ id: 'skill-1', title: 'My Skill', version_number: 2 }]

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse({ skills: remoteSkills }))
        .mockResolvedValueOnce(
          mockResponse({ id: 'skill-1', title: 'My Skill', version_number: 2, content: 'new content' })
        )
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.syncSkills(apiUrl, apiToken)

      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)

      const content = await readFile(join(skillsDir, 'My Skill.md'), 'utf-8')
      expect(content).toBe('new content')
    })

    it('identifies skills to update (title changed)', async () => {
      await store.writeMetadata({
        global_version: 1,
        last_sync: '2026-01-01T00:00:00.000Z',
        skills: {
          'skill-1': { id: 'skill-1', title: 'Old Title', version_number: 1 }
        }
      })
      await writeFile(join(skillsDir, 'Old Title.md'), 'content', 'utf-8')

      // Remote: same version, different title
      const remoteSkills = [{ id: 'skill-1', title: 'New Title', version_number: 1 }]

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse({ skills: remoteSkills }))
        .mockResolvedValueOnce(
          mockResponse({ id: 'skill-1', title: 'New Title', version_number: 1, content: 'content' })
        )
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.syncSkills(apiUrl, apiToken)

      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)

      // Old file should be gone, new file should exist
      expect(existsSync(join(skillsDir, 'Old Title.md'))).toBe(false)
      expect(existsSync(join(skillsDir, 'New Title.md'))).toBe(true)
    })

    it('identifies skills to delete (in local, not in remote)', async () => {
      await store.writeMetadata({
        global_version: 3,
        last_sync: '2026-01-01T00:00:00.000Z',
        skills: {
          'skill-1': { id: 'skill-1', title: 'Keep Me', version_number: 1 },
          'skill-2': { id: 'skill-2', title: 'Delete Me', version_number: 1 }
        }
      })
      await writeFile(join(skillsDir, 'Keep Me.md'), 'keep', 'utf-8')
      await writeFile(join(skillsDir, 'Delete Me.md'), 'delete', 'utf-8')

      // Remote only has skill-1
      const remoteSkills = [{ id: 'skill-1', title: 'Keep Me', version_number: 1 }]

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse({ skills: remoteSkills }))
      vi.stubGlobal('fetch', mockFetch)

      const result = await store.syncSkills(apiUrl, apiToken)

      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)
      expect(result.count).toBe(1)

      expect(existsSync(join(skillsDir, 'Keep Me.md'))).toBe(true)
      expect(existsSync(join(skillsDir, 'Delete Me.md'))).toBe(false)
    })
  })

  // ─── Sync Lock ─────────────────────────────────────────────────────

  describe('sync locking mechanism', () => {
    const apiUrl = 'https://example.com'
    const apiToken = 'test-token'

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('prevents concurrent syncs', async () => {
      // Create a slow fetch that we can control
      let resolveFirstFetch: (value: Response) => void
      const slowFetchPromise = new Promise<Response>((resolve) => {
        resolveFirstFetch = resolve
      })

      const mockFetch = vi.fn().mockReturnValueOnce(slowFetchPromise)
      vi.stubGlobal('fetch', mockFetch)

      // Start first sync (will block on fetchSkillIndex)
      const firstSync = store.syncSkills(apiUrl, apiToken)

      // Immediately start second sync — should return early
      const secondSync = await store.syncSkills(apiUrl, apiToken)
      expect(secondSync.updated).toBe(false)

      // Now resolve the first sync so it completes
      resolveFirstFetch!(mockResponse({ skills: [] }))
      const firstResult = await firstSync
      expect(firstResult.success).toBe(true)
    })
  })

  // ─── Resolver ──────────────────────────────────────────────────────

  describe('resolveSkill()', () => {
    it('returns content when skill file exists', async () => {
      const content = '# Feature Build\n\nBuild a feature step by step.'
      await writeFile(join(skillsDir, 'feature-build.md'), content, 'utf-8')

      const result = await store.resolveSkill('feature-build')
      expect(result).toBe(content)
    })

    it('returns null when skill file does not exist', async () => {
      const result = await store.resolveSkill('nonexistent-skill')
      expect(result).toBeNull()
    })

    it('handles skill names with spaces', async () => {
      const content = '# My Skill'
      await writeFile(join(skillsDir, 'My Skill.md'), content, 'utf-8')

      const result = await store.resolveSkill('My Skill')
      expect(result).toBe(content)
    })
  })
})
