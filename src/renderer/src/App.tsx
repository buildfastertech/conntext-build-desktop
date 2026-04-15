import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import type { UserInfo, Project, Workspace } from '../../preload/index.d'
import { LoginScreen } from './screens/LoginScreen'
import { SetupScreen } from './screens/SetupScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { BuildScreen } from './screens/BuildScreen'
import { MemoryDialog } from './components/MemoryDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { TitleMenuBar } from './components/TitleMenuBar'
import { RiveLoader } from './components/RiveLoader'

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(() => {
    try { const s = localStorage.getItem('selectedProject'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(
    () => localStorage.getItem('workingDirectory')
  )

  // Shared header state
  const [isMemoryDialogOpen, setIsMemoryDialogOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [memories, setMemories] = useState<string[]>([])
  const [skillsCount, setSkillsCount] = useState(0)
  const [skillsVersion, setSkillsVersion] = useState(0)
  const [skillsLastSync, setSkillsLastSync] = useState<string | null>(null)
  const [isSyncingSkills, setIsSyncingSkills] = useState(false)
  const [syncSkillsError, setSyncSkillsError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [projectDirectories, setProjectDirectories] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('projectDirectories'); return s ? JSON.parse(s) : {} } catch { return {} }
  })

  useEffect(() => {
    const init = async () => {
      const [credentials, anthropicKey] = await Promise.all([
        window.api.getCredentials(),
        window.api.getAnthropicKey()
      ])

      const authed = !!credentials
      setIsAuthenticated(authed)
      setUser(credentials?.user ?? null)
      setHasAnthropicKey(!!anthropicKey || localStorage.getItem('setupComplete') === 'true')

      // Fetch workspaces before finishing load so the UI doesn't flash
      if (authed && credentials) {
        try {
          const appState = await window.api.getAppState()
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

          const response = await fetch(`${credentials.apiUrl}/api/workspaces`, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${credentials.apiToken}`
            },
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (response.ok) {
            const data = await response.json()
            const wsList: Workspace[] = data.workspaces ?? data.data ?? []

            if (wsList.length > 0) {
              setWorkspaces(wsList)
              const persisted = appState.activeWorkspaceId
                ? wsList.find(ws => ws.id === appState.activeWorkspaceId)
                : null
              setActiveWorkspace(persisted ?? wsList[0])
            }
          }
        } catch (error) {
          console.error('Failed to fetch workspaces:', error)
        }
      }

      setIsLoading(false)
    }

    init()
  }, [])

  // Load skills info on mount
  useEffect(() => {
    if (isAuthenticated && hasAnthropicKey) {
      window.api.getSkillsInfo().then((info) => {
        setSkillsCount(info.count)
        setSkillsVersion(info.version)
        setSkillsLastSync(info.lastSync)
      }).catch(() => {
        // Ignore errors
      })
    }
  }, [isAuthenticated, hasAnthropicKey])

  const handleSyncSkills = async () => {
    setIsSyncingSkills(true)
    setSyncSkillsError(null)
    try {
      await window.api.syncSkills()
      const info = await window.api.getSkillsInfo()
      setSkillsCount(info.count)
      setSkillsVersion(info.version)
      setSkillsLastSync(info.lastSync)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync skills'
      console.error('Failed to sync skills:', error)
      setSyncSkillsError(errorMessage)
      // Reset skills info to indicate sync failed
      setSkillsCount(0)
      setSkillsLastSync(null)
    } finally {
      setIsSyncingSkills(false)
    }
  }

  // Persist key state to localStorage
  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem('selectedProject', JSON.stringify(selectedProject))
    } else {
      localStorage.removeItem('selectedProject')
    }
  }, [selectedProject])

  useEffect(() => {
    if (workingDirectory) {
      localStorage.setItem('workingDirectory', workingDirectory)
    } else {
      localStorage.removeItem('workingDirectory')
    }
  }, [workingDirectory])

  useEffect(() => {
    localStorage.setItem('projectDirectories', JSON.stringify(projectDirectories))
  }, [projectDirectories])

  const handleSwitchWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace)
    window.api.saveActiveWorkspaceId(workspace.id)
  }

  const handleLogout = () => {
    window.api.clearCredentials()
    window.api.clearAnthropicKey()
    window.api.clearAppState()
    localStorage.removeItem('selectedProject')
    localStorage.removeItem('workingDirectory')
    localStorage.removeItem('projectDirectories')
    localStorage.removeItem('selectedModel')
    localStorage.removeItem('activeFolders')
    localStorage.removeItem('chosenFolders')
    localStorage.removeItem('setupComplete')
    setIsAuthenticated(false)
    setHasAnthropicKey(false)
    setUser(null)
    setSelectedProject(null)
    setWorkingDirectory(null)
    setMemories([])
    setSkillsCount(0)
    setSkillsVersion(0)
    setSkillsLastSync(null)
    setWorkspaces([])
    setActiveWorkspace(null)
  }

  const handleOpenFolder = () => {
    window.api.selectFolder().then((folder) => {
      if (folder) {
        setWorkingDirectory(folder)
      }
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-brand-bg">
        <TitleMenuBar />
        <div className="flex flex-1 items-center justify-center">
          <RiveLoader size="2xl" className="text-brand-purple" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col bg-brand-bg">
        <TitleMenuBar />
        <div className="flex-1 overflow-auto">
          <LoginScreen
            onAuthenticated={async () => {
              const credentials = await window.api.getCredentials()
              setIsAuthenticated(true)
              setUser(credentials?.user ?? null)
            }}
          />
        </div>
      </div>
    )
  }

  if (!hasAnthropicKey) {
    return (
      <div className="flex h-screen flex-col bg-brand-bg">
        <TitleMenuBar />
        <div className="flex-1 overflow-auto">
          <SetupScreen
            userName={user?.name ?? 'User'}
            user={user}
            onComplete={() => {
              localStorage.setItem('setupComplete', 'true')
              setHasAnthropicKey(true)
            }}
            onBack={() => {
              window.api.clearCredentials()
              setIsAuthenticated(false)
              setUser(null)
            }}
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onSwitchWorkspace={handleSwitchWorkspace}
          />
        </div>
      </div>
    )
  }

  if (!selectedProject && !workingDirectory) {
    return (
      <div className="flex h-screen flex-col bg-brand-bg">
        <TitleMenuBar onOpenFolder={handleOpenFolder} />
        <div className="flex-1 overflow-auto">
        <ProjectsScreen
          user={user}
          onSelectProject={(project) => {
            setSelectedProject(project)
            setWorkingDirectory(projectDirectories[project.id] ?? null)
          }}
          onSelectFolder={() => {
            window.api.selectFolder().then((folder) => {
              if (folder) {
                setWorkingDirectory(folder)
              }
            })
          }}
          onLogout={handleLogout}
          onOpenMemory={() => setIsMemoryDialogOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          workingDirectory={workingDirectory}
          memoryCount={memories.length}
          skillsCount={skillsCount}
          skillsVersion={skillsVersion}
          skillsLastSync={skillsLastSync}
          isSyncingSkills={isSyncingSkills}
          onSyncSkills={handleSyncSkills}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSwitchWorkspace={handleSwitchWorkspace}
        />
        <MemoryDialog
          isOpen={isMemoryDialogOpen}
          onClose={() => setIsMemoryDialogOpen(false)}
          memories={memories}
          workingDirectory={workingDirectory}
        />
        <SettingsDialog
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          skillsCount={skillsCount}
          skillsVersion={skillsVersion}
          skillsLastSync={skillsLastSync}
          isSyncingSkills={isSyncingSkills}
          onSyncSkills={handleSyncSkills}
        />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-brand-bg">
      <TitleMenuBar onOpenFolder={handleOpenFolder} />
      <div className="flex-1 overflow-hidden">
        <BuildScreen
          user={user}
          onLogout={handleLogout}
          workingDirectory={workingDirectory}
          selectedProject={selectedProject}
          onBackToProjects={() => {
            setWorkingDirectory(null)
            setSelectedProject(null)
          }}
          onWorkingDirectoryChange={(dir) => {
            setWorkingDirectory(dir)
            if (selectedProject) {
              setProjectDirectories(prev => ({ ...prev, [selectedProject.id]: dir }))
            }
          }}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSwitchWorkspace={handleSwitchWorkspace}
        />
      </div>
      <Toaster position="bottom-right" />
    </div>
  )
}
