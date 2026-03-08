import Store from 'electron-store'
import { join } from 'path'
import { app } from 'electron'
import { mkdir, writeFile, readdir, rm, cp } from 'fs/promises'
import { existsSync, createWriteStream } from 'fs'
import AdmZip from 'adm-zip'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

interface SkillsData {
  version: number
  lastSync: string | null
  skillCount: number
}

export class SkillsStore {
  private store: Store<SkillsData>
  private skillsPath: string

  constructor() {
    this.store = new Store<SkillsData>({
      name: 'skills',
      defaults: {
        version: 0,
        lastSync: null,
        skillCount: 0
      }
    })

    // Store skills in app data directory
    this.skillsPath = join(app.getPath('userData'), 'skills')
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

  private async ensureSkillsDirectory(): Promise<void> {
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
   * Get current version
   */
  getVersion(): number {
    return this.store.get('version', 0)
  }

  /**
   * Get last sync timestamp
   */
  getLastSync(): string | null {
    return this.store.get('lastSync', null)
  }

  /**
   * Get skill count
   */
  getSkillCount(): number {
    return this.store.get('skillCount', 0)
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
      const currentVersion = this.getVersion()

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
        const currentCount = this.getSkillCount()
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

      // Update store
      this.store.set('version', remoteVersion)
      this.store.set('skillCount', skillCount)
      this.store.set('lastSync', new Date().toISOString())

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

    this.store.set('version', 0)
    this.store.set('skillCount', 0)
    this.store.set('lastSync', null)
  }
}
