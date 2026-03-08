import { useState, useEffect } from 'react'
import type { Project, UserInfo, Workspace } from '../../../preload/index.d'
import { FolderOpen, Plus, Search } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'

interface ProjectsScreenProps {
    user: UserInfo | null
    onSelectProject: (project: Project) => void
    onSelectFolder: () => void
    onLogout: () => void
    onOpenMemory: () => void
    onOpenSettings: () => void
    workingDirectory: string | null
    memoryCount: number
    skillsCount: number
    skillsVersion: number
    skillsLastSync: string | null
    isSyncingSkills: boolean
    onSyncSkills: () => void
    workspaces?: Workspace[]
    activeWorkspace?: Workspace | null
    onSwitchWorkspace?: (workspace: Workspace) => void
}

export function ProjectsScreen({ user, onSelectProject, onSelectFolder, onLogout, onOpenMemory, onOpenSettings, workingDirectory, memoryCount, skillsCount, skillsVersion, skillsLastSync, isSyncingSkills, onSyncSkills, workspaces = [], activeWorkspace, onSwitchWorkspace }: ProjectsScreenProps) {
    const [projects, setProjects] = useState<Project[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        loadProjects()
    }, [])

    const loadProjects = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const response = await window.api.fetchProjects()

            if (!response.success) {
                setError(response.error || 'Failed to load projects')
                return
            }

            setProjects(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load projects')
        } finally {
            setIsLoading(false)
        }
    }

    const filteredProjects = projects.filter((project) => {
        const query = searchQuery.toLowerCase()
        return (
            project.name.toLowerCase().includes(query) ||
            project.description?.toLowerCase().includes(query) ||
            project.organisation?.name.toLowerCase().includes(query)
        )
    })

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'active':
                return 'bg-green-500/10 text-green-400 border-green-500/20'
            case 'archived':
                return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
            case 'on hold':
                return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
            default:
                return 'bg-brand-purple/10 text-brand-purple border-brand-purple/20'
        }
    }

    return (
        <div className="flex h-screen flex-col bg-brand-bg">
            <AppHeader
                user={user}
                onLogout={onLogout}
                variant="projects"
                workingDirectory={workingDirectory}
                workspaces={workspaces}
                activeWorkspace={activeWorkspace}
                onSwitchWorkspace={onSwitchWorkspace}
                onOpenMemory={onOpenMemory}
                onOpenSettings={onOpenSettings}
                memoryCount={memoryCount}
                skillsCount={skillsCount}
                skillsVersion={skillsVersion}
                skillsLastSync={skillsLastSync}
                isSyncingSkills={isSyncingSkills}
                onSyncSkills={onSyncSkills}
            />

            {/* Main content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="mx-auto max-w-7xl">
                    {/* Actions bar */}
                    <div className="mb-6 flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-dim" />
                            <input
                                type="text"
                                placeholder="Search projects..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-lg border border-brand-input-border bg-brand-input pl-10 pr-4 py-2.5 text-sm text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30"
                            />
                        </div>

                        <button
                            onClick={onSelectFolder}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-brand-border bg-brand-card px-4 py-2.5 text-sm font-medium text-brand-text transition-colors hover:bg-brand-border"
                        >
                            <FolderOpen className="h-4 w-4" />
                            Browse Local Folder
                        </button>
                    </div>

                    {/* Loading state */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-20">
                            <div className="flex flex-col items-center gap-3">
                                <svg className="h-8 w-8 animate-spin text-brand-purple" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <p className="text-sm text-brand-text-dim">Loading projects...</p>
                            </div>
                        </div>
                    )}

                    {/* Error state */}
                    {error && !isLoading && (
                        <div className="rounded-lg border border-brand-error/20 bg-brand-error/5 p-6">
                            <div className="flex items-start gap-3">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                <div>
                                    <h3 className="font-semibold text-brand-error">Failed to load projects</h3>
                                    <p className="mt-1 text-sm text-brand-error/80">{error}</p>
                                    <button
                                        onClick={loadProjects}
                                        className="mt-3 cursor-pointer rounded-lg bg-brand-error/10 px-3 py-1.5 text-sm font-medium text-brand-error transition-colors hover:bg-brand-error/20"
                                    >
                                        Try Again
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && !error && filteredProjects.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="rounded-full bg-brand-purple/10 p-6">
                                <FolderOpen className="h-12 w-12 text-brand-purple" />
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-brand-text">
                                {searchQuery ? 'No projects found' : 'No projects yet'}
                            </h3>
                            <p className="mt-2 text-sm text-brand-text-dim">
                                {searchQuery
                                    ? 'Try adjusting your search query'
                                    : 'Create a project in ConnText or browse a local folder'}
                            </p>
                            {!searchQuery && (
                                <button
                                    onClick={onSelectFolder}
                                    className="mt-6 flex cursor-pointer items-center gap-2 rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-purple-dim"
                                >
                                    <FolderOpen className="h-4 w-4" />
                                    Browse Local Folder
                                </button>
                            )}
                        </div>
                    )}

                    {/* Projects grid */}
                    {!isLoading && !error && filteredProjects.length > 0 && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredProjects.map((project) => (
                                <button
                                    key={project.id}
                                    onClick={() => onSelectProject(project)}
                                    className="group cursor-pointer rounded-lg border border-brand-border bg-brand-card p-5 text-left transition-all duration-200 hover:border-brand-purple/50 hover:shadow-lg hover:shadow-brand-purple/10"
                                >
                                    <div className="mb-3 flex items-start justify-between">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple/15">
                                            <FolderOpen className="h-5 w-5 text-brand-purple" />
                                        </div>
                                        <span
                                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}
                                        >
                                            {project.status}
                                        </span>
                                    </div>

                                    <h3 className="mb-1.5 font-semibold text-brand-text line-clamp-1">{project.name}</h3>

                                    {project.description && (
                                        <p className="mb-3 text-sm text-brand-text-dim line-clamp-2">{project.description}</p>
                                    )}

                                    {project.organisation && (
                                        <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                            </svg>
                                            <span className="line-clamp-1">{project.organisation.name}</span>
                                        </div>
                                    )}

                                    <div className="mt-3 border-t border-brand-border-subtle pt-3 text-xs text-brand-text-dim">
                                        Updated {new Date(project.updated_at).toLocaleDateString()}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
