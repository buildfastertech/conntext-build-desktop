import { useEffect, useState } from 'react'
import type { UserInfo, Project, Workspace } from '../../preload/index.d'
import { LoginScreen } from './screens/LoginScreen'
import { SetupScreen } from './screens/SetupScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { BuildScreen } from './screens/BuildScreen'
import { MemoryDialog } from './components/MemoryDialog'
import { SettingsDialog } from './components/SettingsDialog'

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null)

  // Shared header state
  const [isMemoryDialogOpen, setIsMemoryDialogOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [memories, setMemories] = useState<string[]>([])
  const [skillsCount, setSkillsCount] = useState(0)
  const [skillsVersion, setSkillsVersion] = useState(0)
  const [skillsLastSync, setSkillsLastSync] = useState<string | null>(null)
  const [isSyncingSkills, setIsSyncingSkills] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.getCredentials(),
      window.api.getAnthropicKey()
    ]).then(([credentials, anthropicKey]) => {
      setIsAuthenticated(!!credentials)
      setUser(credentials?.user ?? null)
      setHasAnthropicKey(!!anthropicKey)
      setIsLoading(false)
    })
  }, [])

  // Fetch ConnText workspaces when authenticated, restore persisted selection
  useEffect(() => {
    if (isAuthenticated) {
      Promise.all([
        window.api.fetchWorkspaces(),
        window.api.getAppState()
      ]).then(([result, appState]) => {
        if (result.success && result.data.length > 0) {
          setWorkspaces(result.data)
          // Restore persisted workspace, or fall back to first
          const persisted = appState.activeWorkspaceId
            ? result.data.find(ws => ws.id === appState.activeWorkspaceId)
            : null
          setActiveWorkspace(persisted ?? result.data[0])
        }
      }).catch((error) => {
        console.error('Failed to fetch workspaces:', error)
      })
    }
  }, [isAuthenticated])

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
    try {
      await window.api.syncSkills()
      const info = await window.api.getSkillsInfo()
      setSkillsCount(info.count)
      setSkillsVersion(info.version)
      setSkillsLastSync(info.lastSync)
    } catch (error) {
      console.error('Failed to sync skills:', error)
    } finally {
      setIsSyncingSkills(false)
    }
  }

  const handleSwitchWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace)
    window.api.saveActiveWorkspaceId(workspace.id)
  }

  const handleLogout = () => {
    window.api.clearCredentials()
    window.api.clearAnthropicKey()
    window.api.clearAppState()
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

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg">
        <svg className="h-5 w-5 animate-spin text-brand-purple" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onAuthenticated={async () => {
          const credentials = await window.api.getCredentials()
          setIsAuthenticated(true)
          setUser(credentials?.user ?? null)
        }}
      />
    )
  }

  if (!hasAnthropicKey) {
    return (
      <SetupScreen
        userName={user?.name ?? 'User'}
        onComplete={() => setHasAnthropicKey(true)}
        onBack={() => {
          window.api.clearCredentials()
          setIsAuthenticated(false)
          setUser(null)
        }}
      />
    )
  }

  if (!selectedProject && !workingDirectory) {
    return (
      <>
        <ProjectsScreen
          user={user}
          onSelectProject={(project) => {
            setSelectedProject(project)
            // We'll handle setting up working directory for the project later
            // For now, just prompt to select a folder
            window.api.selectFolder().then((folder) => {
              if (folder) {
                setWorkingDirectory(folder)
              }
            })
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
      </>
    )
  }

  return (
    <BuildScreen
      user={user}
      onLogout={handleLogout}
      workingDirectory={workingDirectory}
      onBackToProjects={() => {
        setWorkingDirectory(null)
        setSelectedProject(null)
      }}
      workspaces={workspaces}
      activeWorkspace={activeWorkspace}
      onSwitchWorkspace={setActiveWorkspace}
    />
  )
}
