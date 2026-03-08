import { useState, useEffect } from 'react'
import type { Project, UserInfo, Workspace } from '../../../preload/index.d'
import { Star, FolderOpen, Search, Download, Archive } from 'lucide-react'
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

const statusColors: Record<string, string> = {
    discovery: 'border-blue-400 text-blue-400',
    in_progress: 'border-yellow-400 text-yellow-400',
    active: 'border-green-400 text-green-400',
    completed: 'border-green-400 text-green-400',
    on_hold: 'border-orange-400 text-orange-400',
    archived: 'border-gray-400 text-gray-400',
}

const featureStatusIcons: Record<string, { icon: string; color: string }> = {
    draft: { icon: '\u{1F4DD}', color: 'text-brand-text-dim' },
    in_progress: { icon: '\u{1F504}', color: 'text-yellow-400' },
    ready: { icon: '\u{1F680}', color: 'text-blue-400' },
    completed: { icon: '\u2705', color: 'text-green-400' },
    rejected: { icon: '\u274C', color: 'text-red-400' },
    archived: { icon: '\u{1F4E6}', color: 'text-gray-400' },
}

function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
    const statusKey = project.status.toLowerCase().replace(/\s+/g, '_')
    const statusClass = statusColors[statusKey] ?? 'border-brand-purple text-brand-purple'
    const featuresCount = project.features_count ?? 0
    const statuses = project.feature_statuses
    const handoff = project.handoff

    return (
        <div
            onClick={onSelect}
            className="cursor-pointer rounded-xl border border-brand-border bg-brand-card p-5 transition-all duration-200 hover:border-brand-purple/50 hover:shadow-lg hover:shadow-brand-purple/10"
        >
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-purple/15">
                    <Star size={18} className={project.is_starred ? 'fill-brand-purple text-brand-purple' : 'text-brand-text-dim'} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="font-semibold text-brand-text truncate">{project.name}</h3>
                            <p className="text-xs text-brand-text-dim truncate">
                                {project.organisation?.name ?? 'Internal Project'}
                            </p>
                        </div>
                        <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}>
                            {project.status.replace(/_/g, ' ')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Description */}
            <p className="mb-4 text-sm italic text-brand-text-dim/70 line-clamp-2">
                {project.description ?? 'No description provided'}
            </p>

            {/* Features count */}
            <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-purple/15">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple">
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="19" cy="5" r="2" />
                        <circle cx="5" cy="5" r="2" />
                        <circle cx="19" cy="19" r="2" />
                        <circle cx="5" cy="19" r="2" />
                        <line x1="12" y1="9" x2="12" y2="3" />
                        <line x1="9.5" y1="10.5" x2="5.5" y2="6.5" />
                        <line x1="14.5" y1="10.5" x2="18.5" y2="6.5" />
                        <line x1="9.5" y1="13.5" x2="5.5" y2="17.5" />
                        <line x1="14.5" y1="13.5" x2="18.5" y2="17.5" />
                    </svg>
                </div>
                <div>
                    <p className="text-[11px] text-brand-text-dim">Features</p>
                    <p className="text-lg font-bold text-brand-text">{featuresCount}</p>
                </div>
            </div>

            {/* Feature status breakdown */}
            {statuses && (
                <div className="mb-3 rounded-lg border border-brand-border/50 bg-brand-bg/50 px-3 py-2">
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                        {Object.entries(featureStatusIcons).map(([key, { icon, color }]) => (
                            <div key={key} className="flex items-center gap-1.5">
                                <span className={`${color} text-[11px]`}>{icon}</span>
                                <span className="text-brand-text-dim capitalize">{key.replace(/_/g, ' ')}</span>
                                <span className="ml-auto font-medium text-brand-text">
                                    {statuses[key as keyof typeof statuses] ?? 0}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer: Handoff + Archive */}
            <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-brand-border/50 bg-brand-bg/50 px-3 py-2.5">
                    {handoff?.generated_at ? (
                        <div className="flex items-center gap-2">
                            <Download size={16} className="text-green-400 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-brand-text truncate">Download Handoff</p>
                                <p className="text-[10px] text-brand-text-dim">
                                    Generated {new Date(handoff.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Download size={16} className="text-brand-text-dim/40 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-brand-text-dim">No handoff generated</p>
                                <p className="text-[10px] text-brand-text-dim/60">Generate a handoff to share with your dev team</p>
                            </div>
                        </div>
                    )}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        // Archive action placeholder
                    }}
                    className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-brand-border/50 bg-brand-bg/50 px-4 text-brand-text-dim transition-colors hover:bg-brand-border/30 hover:text-brand-text"
                    title="Archive"
                >
                    <Archive size={16} />
                    <span className="text-[10px]">Archive</span>
                </button>
            </div>
        </div>
    )
}

export function ProjectsScreen({ user, onSelectProject, onSelectFolder, onLogout, onOpenMemory, onOpenSettings, workingDirectory, memoryCount, skillsCount, skillsVersion, skillsLastSync, isSyncingSkills, onSyncSkills, workspaces = [], activeWorkspace, onSwitchWorkspace }: ProjectsScreenProps) {
    const [projects, setProjects] = useState<Project[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Reload projects when workspace changes
    useEffect(() => {
        loadProjects()
    }, [activeWorkspace?.id])

    const loadProjects = async () => {
        if (!activeWorkspace) {
            setProjects([])
            setIsLoading(false)
            return
        }

        try {
            setIsLoading(true)
            setError(null)

            const credentials = await window.api.getCredentials()
            if (!credentials) {
                setError('Not authenticated')
                return
            }

            const response = await fetch(
                `${credentials.apiUrl}/api/workspaces/${activeWorkspace.id}/projects`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${credentials.apiToken}`
                    }
                }
            )

            if (!response.ok) {
                setError(`Failed to load projects: ${response.statusText}`)
                return
            }

            const data = await response.json()
            setProjects(data.projects ?? data.data ?? [])
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

    const starredProjects = filteredProjects.filter((p) => p.is_starred)
    const allProjects = filteredProjects.filter((p) => !p.is_starred)

    return (
        <div className="flex h-full flex-col bg-brand-bg">
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
                {/* Search bar */}
                <div className="mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-dim" />
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-brand-input-border bg-brand-input pl-10 pr-4 py-2.5 text-sm text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30"
                        />
                    </div>
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
                                : 'Create a project in ConnText to get started'}
                        </p>
                    </div>
                )}

                {/* Project sections */}
                {!isLoading && !error && filteredProjects.length > 0 && (
                    <div className="space-y-8">
                        {/* Starred Projects */}
                        {starredProjects.length > 0 && (
                            <section>
                                <div className="mb-4 flex items-center gap-2.5">
                                    <Star size={20} className="fill-yellow-400 text-yellow-400" />
                                    <h2 className="text-base font-bold text-brand-text">Starred Projects</h2>
                                    <span className="rounded-full bg-brand-purple/20 px-2 py-0.5 text-[11px] font-semibold text-brand-purple">
                                        {starredProjects.length}
                                    </span>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                                    {starredProjects.map((project) => (
                                        <ProjectCard
                                            key={project.id}
                                            project={project}
                                            onSelect={() => onSelectProject(project)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* All Projects */}
                        <section>
                            <div className="mb-4 flex items-center gap-2.5">
                                <FolderOpen size={20} className="text-brand-text-dim" />
                                <h2 className="text-base font-bold text-brand-text">
                                    {starredProjects.length > 0 ? 'All Projects' : 'Projects'}
                                </h2>
                                <span className="rounded-full bg-brand-purple/20 px-2 py-0.5 text-[11px] font-semibold text-brand-purple">
                                    {starredProjects.length > 0 ? allProjects.length : filteredProjects.length}
                                </span>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                                {(starredProjects.length > 0 ? allProjects : filteredProjects).map((project) => (
                                    <ProjectCard
                                        key={project.id}
                                        project={project}
                                        onSelect={() => onSelectProject(project)}
                                    />
                                ))}
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    )
}
