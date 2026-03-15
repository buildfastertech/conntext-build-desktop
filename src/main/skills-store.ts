import { join } from 'path'
import { app } from 'electron'
import { mkdir, writeFile, readFile, rm, rename } from 'fs/promises'
import { existsSync } from 'fs'

export interface SkillMetadata {
  id: string
  title: string
  version_number: number
  purpose?: string | null
  arguments?: Record<string, string> | null
}

export interface MetadataFile {
  global_version: number
  last_sync: string | null
  skills: Record<string, SkillMetadata>
}

export interface SyncResult {
  success: boolean
  count: number
  updated: boolean
  error?: string
  partialFailure?: boolean
}

export class SkillsStore {
  private skillsPath: string
  private metadataPath: string
  private cachedMetadata: MetadataFile | null = null
  private isSyncing: boolean = false

  constructor() {
    // Store skills in app data directory
    this.skillsPath = join(app.getPath('userData'), 'skills')
    this.metadataPath = join(this.skillsPath, 'metadata.json')
    console.log(`[SkillsStore] Skills directory: ${this.skillsPath}`)
    this.ensureSkillsDirectory()
  }

  /**
   * Check if URL is a local/development environment where we should bypass SSL verification
   */
  private isLocalEnvironment(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase()
      return hostname === 'localhost' ||
             hostname === '127.0.0.1' ||
             hostname.endsWith('.test') ||
             hostname.endsWith('.local')
    } catch {
      return false
    }
  }

  /**
   * Fetch wrapper that handles SSL verification for local environments
   */
  private async secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const shouldBypassSSL = this.isLocalEnvironment(url)

    if (shouldBypassSSL) {
      // Temporarily disable SSL verification for local/dev environments
      const originalValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

      try {
        return await fetch(url, options)
      } finally {
        // Restore original value
        if (originalValue === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalValue
        }
      }
    }

    return fetch(url, options)
  }

  async ensureSkillsDirectory(): Promise<void> {
    if (!existsSync(this.skillsPath)) {
      await mkdir(this.skillsPath, { recursive: true })
    }
  }

  /**
   * Get the path to the local skills cache directory
   */
  getSkillsPath(): string {
    return this.skillsPath
  }

  /**
   * Validate that an unknown value conforms to the MetadataFile structure
   */
  isMetadataValid(data: unknown): data is MetadataFile {
    if (data === null || typeof data !== 'object') {
      return false
    }

    const obj = data as Record<string, unknown>

    if (typeof obj.global_version !== 'number' || !Number.isInteger(obj.global_version)) {
      return false
    }

    if (obj.last_sync !== null && typeof obj.last_sync !== 'string') {
      return false
    }

    if (obj.skills === null || typeof obj.skills !== 'object' || Array.isArray(obj.skills)) {
      return false
    }

    const skills = obj.skills as Record<string, unknown>
    for (const key of Object.keys(skills)) {
      const skill = skills[key]
      if (skill === null || typeof skill !== 'object') {
        return false
      }

      const s = skill as Record<string, unknown>
      if (typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.version_number !== 'number') {
        return false
      }

      if (!Number.isInteger(s.version_number)) {
        return false
      }

      // Ensure the key matches the skill id
      if (s.id !== key) {
        return false
      }
    }

    return true
  }

  /**
   * Read and parse metadata.json from disk.
   * Returns null if the file is missing, unreadable, or contains invalid data.
   * Populates the in-memory cache on success.
   */
  async readMetadata(): Promise<MetadataFile | null> {
    try {
      const raw = await readFile(this.metadataPath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      if (!this.isMetadataValid(parsed)) {
        console.warn('[SkillsStore] metadata.json failed validation, treating as corrupt')
        return null
      }

      this.cachedMetadata = parsed
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('[SkillsStore] metadata.json not found')
      } else {
        console.warn('[SkillsStore] Failed to read metadata.json:', error)
      }
      return null
    }
  }

  /**
   * Atomically write metadata.json to disk.
   * Writes to a temporary file first, then renames to the final path to prevent corruption.
   * Also updates the in-memory cache.
   */
  async writeMetadata(metadata: MetadataFile): Promise<void> {
    await this.ensureSkillsDirectory()

    const tempPath = join(this.skillsPath, `metadata.json.tmp.${Date.now()}`)

    try {
      const content = JSON.stringify(metadata, null, 2)
      await writeFile(tempPath, content, 'utf-8')
      await rename(tempPath, this.metadataPath)
      this.cachedMetadata = metadata
      console.log('[SkillsStore] metadata.json written successfully')
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        if (existsSync(tempPath)) {
          await rm(tempPath, { force: true })
        }
      } catch {
        // Ignore cleanup errors
      }
      throw error
    }
  }

  /**
   * Check whether metadata.json needs an initial sync.
   * Returns true if metadata is missing or corrupt.
   */
  async needsInitialSync(): Promise<boolean> {
    const metadata = await this.readMetadata()
    return metadata === null
  }

  /**
   * Get current global version from metadata.json
   */
  async getVersion(): Promise<number> {
    if (this.cachedMetadata) {
      return this.cachedMetadata.global_version
    }
    const metadata = await this.readMetadata()
    return metadata?.global_version ?? 0
  }

  /**
   * Get last sync timestamp from metadata.json
   */
  async getLastSync(): Promise<string | null> {
    if (this.cachedMetadata) {
      return this.cachedMetadata.last_sync
    }
    const metadata = await this.readMetadata()
    return metadata?.last_sync ?? null
  }

  /**
   * Get skill count from metadata.json
   */
  async getSkillCount(): Promise<number> {
    if (this.cachedMetadata) {
      return Object.keys(this.cachedMetadata.skills).length
    }
    const metadata = await this.readMetadata()
    return metadata ? Object.keys(metadata.skills).length : 0
  }

  /**
   * Handle API response errors with user-friendly messages
   */
  private handleApiResponse(response: Response, endpoint: string): void {
    if (response.ok) {
      return
    }

    switch (response.status) {
      case 401:
        throw new Error('Authentication failed - please log in again')
      case 403:
        throw new Error('Access denied')
      case 429:
        throw new Error('Rate limited - please try again later')
      default:
        throw new Error(`API request to ${endpoint} failed: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Check the remote global version number
   */
  async checkRemoteVersion(apiUrl: string, apiToken: string): Promise<{ global_version_number: number }> {
    const endpoint = `${apiUrl}/api/skills/check-version`
    const response = await this.secureFetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      }
    })

    this.handleApiResponse(response, endpoint)
    return await response.json()
  }

  /**
   * Fetch the index of all available skills
   */
  async fetchSkillIndex(apiUrl: string, apiToken: string): Promise<Array<{ id: string; title: string; version_number: number; purpose?: string | null; arguments?: Record<string, string> | null }>> {
    const endpoint = `${apiUrl}/api/skills`
    const response = await this.secureFetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      }
    })

    this.handleApiResponse(response, endpoint)
    const data = await response.json()
    return data.skills
  }

  /**
   * Fetch the content of a single skill
   */
  async fetchSkillContent(apiUrl: string, apiToken: string, skillId: string): Promise<{ id: string; title: string; version_number: number; content: string; purpose?: string | null; arguments?: Record<string, string> | null }> {
    const endpoint = `${apiUrl}/api/skills/${skillId}`
    const response = await this.secureFetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      }
    })

    this.handleApiResponse(response, endpoint)
    return await response.json()
  }

  /**
   * Sync skills from ConnText API using individual skill downloads.
   * Compares remote index with local metadata to determine adds, updates, and deletions.
   * Uses a locking mechanism to prevent concurrent sync operations.
   */
  async syncSkills(apiUrl: string, apiToken: string): Promise<SyncResult> {
    // Acquire sync lock — if already syncing, return early (no-op)
    if (this.isSyncing) {
      const currentCount = await this.getSkillCount()
      console.log('[SkillsStore] Sync already in progress, skipping')
      return { success: true, count: currentCount, updated: false }
    }

    this.isSyncing = true

    try {
      console.log('[SkillsStore] Starting sync...')
      await this.ensureSkillsDirectory()

      // 1. Fetch the remote skill index
      const remoteSkills = await this.fetchSkillIndex(apiUrl, apiToken)
      console.log(`[SkillsStore] Remote index contains ${remoteSkills.length} skills`)

      // 2. Read local metadata (create default if null)
      let metadata = await this.readMetadata()
      if (!metadata) {
        metadata = {
          global_version: 0,
          last_sync: null,
          skills: {}
        }
        console.log('[SkillsStore] No existing metadata, starting fresh')
      }

      // 3. Build remote lookup and determine remote global version
      const remoteById = new Map(remoteSkills.map(s => [s.id, s]))
      const remoteGlobalVersion = remoteSkills.reduce(
        (max, s) => Math.max(max, s.version_number),
        0
      )

      // 4. Build three lists: toAdd, toUpdate, toDelete
      const toAdd: Array<{ id: string; title: string; version_number: number }> = []
      const toUpdate: Array<{ id: string; title: string; version_number: number; oldTitle: string }> = []
      const toDelete: Array<{ id: string; title: string }> = []

      // Find skills to add or update
      for (const remote of remoteSkills) {
        const local = metadata.skills[remote.id]
        if (!local) {
          toAdd.push(remote)
        } else if (remote.version_number > local.version_number || remote.title !== local.title) {
          toUpdate.push({ ...remote, oldTitle: local.title })
        }
      }

      // Find skills to delete (local skills not in remote index)
      for (const [localId, localSkill] of Object.entries(metadata.skills)) {
        if (!remoteById.has(localId)) {
          toDelete.push({ id: localId, title: localSkill.title })
        }
      }

      console.log(`[SkillsStore] Sync plan — Add: ${toAdd.length}, Update: ${toUpdate.length}, Delete: ${toDelete.length}`)

      // 5. Process deletions
      for (const skill of toDelete) {
        try {
          const filePath = join(this.skillsPath, `${skill.title}.md`)
          if (existsSync(filePath)) {
            await rm(filePath, { force: true })
          }
          delete metadata.skills[skill.id]
          console.log(`[SkillsStore] Deleted skill: ${skill.title}`)
        } catch (error) {
          console.error(`[SkillsStore] Failed to delete skill ${skill.title}:`, error)
        }
      }

      // 6. Process additions and updates
      let failureCount = 0

      for (const skill of toAdd) {
        try {
          const detail = await this.fetchSkillContent(apiUrl, apiToken, skill.id)
          const filePath = join(this.skillsPath, `${detail.title}.md`)
          await writeFile(filePath, detail.content, 'utf-8')
          metadata.skills[skill.id] = {
            id: skill.id,
            title: detail.title,
            version_number: detail.version_number,
            purpose: detail.purpose ?? null,
            arguments: detail.arguments ?? null
          }
          console.log(`[SkillsStore] Added skill: ${detail.title}`)
        } catch (error) {
          failureCount++
          console.error(`[SkillsStore] Failed to download skill ${skill.id} (${skill.title}):`, error)
        }
      }

      for (const skill of toUpdate) {
        try {
          const detail = await this.fetchSkillContent(apiUrl, apiToken, skill.id)

          // If title changed, delete the old file first
          if (skill.oldTitle !== detail.title) {
            const oldFilePath = join(this.skillsPath, `${skill.oldTitle}.md`)
            if (existsSync(oldFilePath)) {
              await rm(oldFilePath, { force: true })
              console.log(`[SkillsStore] Renamed skill file: ${skill.oldTitle}.md -> ${detail.title}.md`)
            }
          }

          const filePath = join(this.skillsPath, `${detail.title}.md`)
          await writeFile(filePath, detail.content, 'utf-8')
          metadata.skills[skill.id] = {
            id: skill.id,
            title: detail.title,
            version_number: detail.version_number,
            purpose: detail.purpose ?? null,
            arguments: detail.arguments ?? null
          }
          console.log(`[SkillsStore] Updated skill: ${detail.title}`)
        } catch (error) {
          failureCount++
          console.error(`[SkillsStore] Failed to update skill ${skill.id} (${skill.title}):`, error)
        }
      }

      // 6b. Backfill purpose and arguments from index for skills that weren't added/updated
      // This ensures existing skills get the new metadata fields even without a version bump
      for (const remote of remoteSkills) {
        const local = metadata.skills[remote.id]
        if (local && !toAdd.some(s => s.id === remote.id) && !toUpdate.some(s => s.id === remote.id)) {
          local.purpose = remote.purpose ?? null
          local.arguments = remote.arguments ?? null
        }
      }

      // 7. Update metadata and write to disk
      const hasFailures = failureCount > 0
      const hasChanges = toAdd.length > 0 || toUpdate.length > 0 || toDelete.length > 0

      if (!hasFailures) {
        // Only update global version if everything succeeded
        metadata.global_version = remoteGlobalVersion
      } else {
        console.warn(`[SkillsStore] ${failureCount} skill(s) failed to download — global version NOT updated`)
      }

      metadata.last_sync = new Date().toISOString()
      await this.writeMetadata(metadata)

      const totalSkills = Object.keys(metadata.skills).length
      console.log(`[SkillsStore] Sync complete — ${totalSkills} skills, ${hasFailures ? 'with failures' : 'all succeeded'}`)

      return {
        success: !hasFailures,
        count: totalSkills,
        updated: hasChanges,
        partialFailure: hasFailures ? true : undefined,
        error: hasFailures ? `${failureCount} skill(s) failed to download` : undefined
      }
    } catch (error) {
      console.error('[SkillsStore] Sync failed:', error)
      return {
        success: false,
        count: 0,
        updated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Check remote version and sync only if versions differ.
   * Used for automatic startup checks.
   */
  async checkAndSync(apiUrl: string, apiToken: string): Promise<SyncResult> {
    try {
      const remoteVersionData = await this.checkRemoteVersion(apiUrl, apiToken)
      const localVersion = await this.getVersion()

      console.log(`[SkillsStore] Version check — Remote: ${remoteVersionData.global_version_number}, Local: ${localVersion}`)

      if (remoteVersionData.global_version_number === localVersion && localVersion > 0) {
        const currentCount = await this.getSkillCount()
        console.log(`[SkillsStore] Already up to date (version ${localVersion}) with ${currentCount} skills`)
        return { success: true, count: currentCount, updated: false }
      }

      console.log('[SkillsStore] Version mismatch, triggering sync...')
      return await this.syncSkills(apiUrl, apiToken)
    } catch (error) {
      console.error('[SkillsStore] Check and sync failed:', error)
      return {
        success: false,
        count: 0,
        updated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get a list of all locally known skills with their id, title, version, purpose, and arguments
   */
  async getSkillsList(): Promise<Array<SkillMetadata>> {
    const metadata = await this.readMetadata()
    if (!metadata) return []
    return Object.values(metadata.skills)
  }

  /**
   * Resolve a skill by command name.
   * Looks for a file named `{commandName}.md` in the skills directory.
   * Returns the file content if found, or null if not found.
   */
  async resolveSkill(commandName: string): Promise<string | null> {
    const filePath = join(this.skillsPath, `${commandName}.md`)
    try {
      const content = await readFile(filePath, 'utf-8')
      return content
    } catch {
      return null
    }
  }

  /**
   * Clear all skills
   */
  async clearSkills(): Promise<void> {
    if (existsSync(this.skillsPath)) {
      await rm(this.skillsPath, { recursive: true, force: true })
    }
    await mkdir(this.skillsPath, { recursive: true })

    // Write a fresh metadata.json
    await this.writeMetadata({
      global_version: 0,
      last_sync: null,
      skills: {}
    })
  }
}
