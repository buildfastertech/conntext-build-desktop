import { join } from 'path'
import { app } from 'electron'
import { mkdir, writeFile, readFile, readdir, rm, cp, rename } from 'fs/promises'
import { existsSync, createWriteStream } from 'fs'
import AdmZip from 'adm-zip'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

export interface SkillMetadata {
  id: string
  title: string
  version_number: number
}

export interface MetadataFile {
  global_version: number
  last_sync: string | null
  skills: Record<string, SkillMetadata>
}

export class SkillsStore {
  private skillsPath: string
  private metadataPath: string
  private cachedMetadata: MetadataFile | null = null

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
   * Sync skills from ConnText API
   */
  async syncSkills(apiUrl: string, apiToken: string): Promise<{ success: boolean; count: number; error?: string; updated: boolean }> {
    try {
      console.log('[SkillsStore] Starting sync...')

      // Fetch skills info from ConnText API
      const infoResponse = await this.secureFetch(`${apiUrl}/api/skills`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      })

      if (!infoResponse.ok) {
        throw new Error(`API request failed: ${infoResponse.statusText}`)
      }

      const skillsInfo = await infoResponse.json()
      const remoteVersion = skillsInfo.version || 0
      const downloadUrl = skillsInfo.download_url
      const currentVersion = await this.getVersion()

      console.log(`[SkillsStore] Version check - Remote: ${remoteVersion}, Current: ${currentVersion}, Download URL: ${downloadUrl}`)

      // Check if we need to update
      if (remoteVersion === 0 || !downloadUrl) {
        console.log('[SkillsStore] No skills package available on server')
        return {
          success: true,
          count: 0,
          updated: false,
          error: 'No skills package available on server'
        }
      }

      if (remoteVersion <= currentVersion) {
        // Already up to date
        const currentCount = await this.getSkillCount()
        console.log(`[SkillsStore] Already up to date with ${currentCount} skills`)
        return {
          success: true,
          count: currentCount,
          updated: false
        }
      }

      console.log('[SkillsStore] New version available, downloading...')

      // Download the zip file
      const downloadResponse = await this.secureFetch(`${apiUrl}/api/skills/download`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      })

      if (!downloadResponse.ok) {
        throw new Error(`Download failed: ${downloadResponse.statusText}`)
      }

      // Save zip to temp file
      const tempZipPath = join(app.getPath('temp'), 'skills.zip')
      const fileStream = createWriteStream(tempZipPath)

      if (!downloadResponse.body) {
        throw new Error('Response body is null')
      }

      await pipeline(Readable.fromWeb(downloadResponse.body as any), fileStream)

      // Clear existing skills directory
      if (existsSync(this.skillsPath)) {
        await rm(this.skillsPath, { recursive: true, force: true })
      }
      await mkdir(this.skillsPath, { recursive: true })

      // Extract zip file
      console.log(`[SkillsStore] Extracting skills to: ${this.skillsPath}`)
      const zip = new AdmZip(tempZipPath)
      zip.extractAllTo(this.skillsPath, true)
      console.log(`[SkillsStore] Extraction complete`)

      // Check if ZIP has .claude/skills structure and flatten if needed
      const claudeDirPath = join(this.skillsPath, '.claude')
      const claudeSkillsPath = join(claudeDirPath, 'skills')

      console.log(`[SkillsStore] Checking for .claude/skills at: ${claudeSkillsPath}`)
      console.log(`[SkillsStore] .claude exists: ${existsSync(claudeDirPath)}`)
      console.log(`[SkillsStore] .claude/skills exists: ${existsSync(claudeSkillsPath)}`)

      if (existsSync(claudeDirPath)) {
        const claudeContents = await readdir(claudeDirPath, { withFileTypes: true })
        console.log(`[SkillsStore] Contents of .claude:`, claudeContents.map(e => `${e.name} (${e.isDirectory() ? 'dir' : 'file'})`))
      }

      if (existsSync(claudeSkillsPath)) {
        console.log(`[SkillsStore] Found .claude/skills structure, flattening...`)

        // Read contents of .claude/skills
        const skillEntries = await readdir(claudeSkillsPath, { withFileTypes: true })

        // Move each skill folder to root
        for (const entry of skillEntries) {
          if (entry.isDirectory()) {
            const source = join(claudeSkillsPath, entry.name)
            const dest = join(this.skillsPath, entry.name)
            await cp(source, dest, { recursive: true })
            console.log(`[SkillsStore] Moved ${entry.name} to root`)
          }
        }

        // Remove .claude directory
        await rm(join(this.skillsPath, '.claude'), { recursive: true, force: true })
        console.log(`[SkillsStore] Cleaned up .claude directory`)
      }

      // Count extracted skills (folders with SKILL.md)
      const entries = await readdir(this.skillsPath, { withFileTypes: true })
      console.log(`[SkillsStore] Found ${entries.length} entries in skills directory:`, entries.map(e => `${e.name} (${e.isDirectory() ? 'dir' : 'file'})`))

      const skillFolders = entries.filter(e => e.isDirectory())
      let skillCount = 0

      for (const folder of skillFolders) {
        const skillMdPath = join(this.skillsPath, folder.name, 'SKILL.md')
        console.log(`[SkillsStore] Checking for SKILL.md in: ${folder.name} -> ${existsSync(skillMdPath) ? 'FOUND' : 'NOT FOUND'}`)
        if (existsSync(skillMdPath)) {
          skillCount++
        }
      }

      console.log(`[SkillsStore] Total skills counted: ${skillCount}`)

      // Update metadata.json
      const metadata: MetadataFile = {
        global_version: remoteVersion,
        last_sync: new Date().toISOString(),
        skills: {}
      }
      await this.writeMetadata(metadata)

      // Clean up temp file
      await rm(tempZipPath, { force: true })

      return { success: true, count: skillCount, updated: true }
    } catch (error) {
      console.error('Error syncing skills:', error)
      return {
        success: false,
        count: 0,
        updated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
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
