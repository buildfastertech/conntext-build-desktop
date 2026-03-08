import { useState, useEffect, useRef } from 'react'
import { Brain, FolderOpen, Zap, RefreshCw, ChevronDown, Building2, User } from 'lucide-react'
import type { UserInfo, Workspace } from '../../../preload/index.d'
import conntextLogo from '../../../../assets/images/conntext-logo.png'

interface AppHeaderProps {
    user: UserInfo | null
    onLogout: () => void
    variant: 'projects' | 'build'
    workingDirectory?: string | null

    // Workspace
    workspaces?: Workspace[]
    activeWorkspace?: Workspace | null
    onSwitchWorkspace?: (workspace: Workspace) => void

    // Build screen specific
    onBackToProjects?: () => void
    onOpenMemory?: () => void
    onOpenSettings?: () => void
    memoryCount?: number
    skillsCount?: number
    skillsVersion?: number
    skillsLastSync?: string | null
    isSyncingSkills?: boolean
    onSyncSkills?: () => void
}

export function AppHeader({
    user,
    onLogout,
    variant,
    workingDirectory,
    workspaces = [],
    activeWorkspace,
    onSwitchWorkspace,
    onBackToProjects,
    onOpenMemory,
    onOpenSettings,
    memoryCount = 0,
    skillsCount = 0,
    skillsVersion = 0,
    skillsLastSync = null,
    isSyncingSkills = false,
    onSyncSkills
}: AppHeaderProps) {
    const [showMenu, setShowMenu] = useState(false)
    const [showSkillsPopover, setShowSkillsPopover] = useState(false)
    const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const skillsRef = useRef<HTMLDivElement>(null)
    const workspaceRef = useRef<HTMLDivElement>(null)

    const initials = user?.name
        ? user.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
        : '?'

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false)
            }
        }
        if (showMenu) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showMenu])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (skillsRef.current && !skillsRef.current.contains(e.target as Node)) {
                setShowSkillsPopover(false)
            }
        }
        if (showSkillsPopover) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showSkillsPopover])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
                setShowWorkspaceSwitcher(false)
            }
        }
        if (showWorkspaceSwitcher) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showWorkspaceSwitcher])

    const getDirectoryName = (dir: string) => {
        const parts = dir.replace(/\\/g, '/').split('/')
        return parts[parts.length - 1] || parts[parts.length - 2] || dir
    }

    const WorkspaceIcon = ({ type }: { type: string }) => (
        type === 'personal'
            ? <User size={14} className="text-brand-text-dim flex-shrink-0" />
            : <Building2 size={14} className="text-brand-text-dim flex-shrink-0" />
    )

    return (
        <div
            className="flex items-center justify-between border-b border-brand-border bg-brand-card/50 px-5 py-3"
            style={variant === 'build' ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
        >
            {/* Left side */}
            <div
                className="flex items-center gap-3"
                style={variant === 'build' ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
            >
                <img src={conntextLogo} alt="ConnText" className="h-7" />
                <div className="h-5 w-px bg-brand-border/50" />

                {activeWorkspace ? (
                    <div className="relative" ref={workspaceRef}>
                        <button
                            onClick={() => setShowWorkspaceSwitcher(!showWorkspaceSwitcher)}
                            className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-1.5 transition-all hover:bg-brand-border/30 group"
                            title={activeWorkspace.name}
                        >
                            {activeWorkspace.workspace_type === 'personal'
                                ? <User size={16} className="text-brand-purple flex-shrink-0" />
                                : <Building2 size={16} className="text-brand-purple flex-shrink-0" />
                            }
                            <div className="text-left min-w-0">
                                <div className="text-sm font-medium text-brand-text truncate max-w-[200px]">
                                    {activeWorkspace.name}
                                </div>
                                {workingDirectory && (
                                    <div className="text-[10px] text-brand-text-dim truncate max-w-[200px]">
                                        {getDirectoryName(workingDirectory)}
                                    </div>
                                )}
                            </div>
                            <ChevronDown size={14} className={`text-brand-text-dim transition-transform ${showWorkspaceSwitcher ? 'rotate-180' : ''}`} />
                        </button>

                        {showWorkspaceSwitcher && (
                            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-brand-border bg-brand-card py-1 shadow-xl shadow-black/30">
                                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand-text-dim">
                                    Workspaces
                                </div>

                                {/* Active workspace */}
                                <div className="mx-1 rounded-md bg-brand-purple/10 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <WorkspaceIcon type={activeWorkspace.workspace_type} />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-medium text-brand-text truncate">{activeWorkspace.name}</div>
                                            <div className="text-[10px] text-brand-text-dim truncate capitalize">{activeWorkspace.workspace_type}</div>
                                        </div>
                                        <span className="text-[9px] font-medium text-brand-purple bg-brand-purple/20 rounded-full px-1.5 py-0.5 flex-shrink-0">Active</span>
                                    </div>
                                </div>

                                {/* Other workspaces */}
                                {workspaces.filter(ws => ws.id !== activeWorkspace.id).length > 0 && (
                                    <>
                                        <div className="mx-3 my-1.5 border-t border-brand-border/30" />
                                        {workspaces
                                            .filter(ws => ws.id !== activeWorkspace.id)
                                            .map(ws => (
                                                <button
                                                    key={ws.id}
                                                    onClick={() => {
                                                        setShowWorkspaceSwitcher(false)
                                                        onSwitchWorkspace?.(ws)
                                                    }}
                                                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-brand-border/20"
                                                >
                                                    <WorkspaceIcon type={ws.workspace_type} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-xs text-brand-text truncate">{ws.name}</div>
                                                        <div className="text-[10px] text-brand-text-dim truncate capitalize">{ws.workspace_type}</div>
                                                    </div>
                                                </button>
                                            ))
                                        }
                                    </>
                                )}

                                {workspaces.length === 0 && (
                                    <div className="px-4 py-3 text-xs text-brand-text-dim text-center">
                                        No other workspaces available
                                    </div>
                                )}

                                {/* Back to projects */}
                                <div className="mx-3 my-1.5 border-t border-brand-border/30" />
                                <button
                                    onClick={() => {
                                        setShowWorkspaceSwitcher(false)
                                        onBackToProjects?.()
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-xs text-brand-text-muted transition-colors hover:bg-brand-border/20"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M15 18l-6-6 6-6" />
                                    </svg>
                                    <span>Back to project list</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : onBackToProjects ? (
                    <button
                        onClick={onBackToProjects}
                        className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-brand-text-dim transition-all hover:bg-brand-border/30 hover:text-brand-text hover:scale-[1.02]"
                        title="Back to Projects"
                    >
                        <FolderOpen size={16} />
                        <span>Projects</span>
                    </button>
                ) : (
                    <div>
                        <h1 className="text-sm font-semibold text-brand-text">ConnText Build</h1>
                        <p className="text-xs text-brand-text-dim">Select a project to get started</p>
                    </div>
                )}
            </div>

            {/* Right side */}
            <div
                className="flex items-center gap-1"
                style={variant === 'build' ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
            >
                {/* Memory (only show when project is selected) */}
                {workingDirectory && onOpenMemory && (
                    <button
                        onClick={onOpenMemory}
                        className="relative cursor-pointer rounded-lg p-2 text-brand-text-dim transition-colors hover:bg-brand-border/30 hover:text-brand-text-muted"
                        title="Memory"
                    >
                        <Brain size={20} />
                        {memoryCount > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-purple px-1 text-[9px] font-semibold text-white">
                                {memoryCount}
                            </span>
                        )}
                    </button>
                )}

                {/* Skills */}
                {onSyncSkills && (
                    <div className="relative" ref={skillsRef}>
                        <button
                            onClick={() => setShowSkillsPopover(!showSkillsPopover)}
                            className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-brand-border/30"
                            title="Agent Skills"
                        >
                            <Zap
                                size={20}
                                className={skillsCount === 0 ? 'text-red-500' : 'text-green-500'}
                            />
                        </button>

                        {showSkillsPopover && (
                            <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-brand-border bg-brand-card py-3 px-4 shadow-xl shadow-black/30">
                                <div className="mb-3 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-brand-purple" />
                                    <h4 className="text-sm font-semibold text-brand-text">Agent Skills</h4>
                                </div>
                                <div className="mb-3 space-y-1.5 text-xs text-brand-text-muted">
                                    <div className="flex items-center justify-between">
                                        <span>Skills:</span>
                                        <span className="font-medium text-brand-text">{skillsCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Version:</span>
                                        <span className="font-medium text-brand-text">{skillsVersion}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Last synced:</span>
                                        <span className="font-medium text-brand-text">
                                            {skillsLastSync ? new Date(skillsLastSync).toLocaleDateString() : 'Never'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        onSyncSkills()
                                        setShowSkillsPopover(false)
                                    }}
                                    disabled={isSyncingSkills}
                                    className="w-full cursor-pointer rounded-lg bg-brand-purple/10 px-3 py-2 text-xs font-medium text-brand-purple transition-colors hover:bg-brand-purple/20 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw size={12} className={isSyncingSkills ? 'animate-spin' : ''} />
                                    {isSyncingSkills ? 'Syncing...' : 'Sync Skills'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Settings */}
                {onOpenSettings && (
                    <button
                        onClick={onOpenSettings}
                        className="cursor-pointer rounded-lg p-2 text-brand-text-dim transition-colors hover:bg-brand-border/30 hover:text-brand-text-muted"
                        title="Settings"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                )}

                {/* Profile */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-brand-border/30"
                    >
                        <span className="text-xs text-brand-text-muted">{user?.name ?? 'Unknown'}</span>
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-purple/20 text-[11px] font-semibold text-brand-purple">
                            {initials}
                        </div>
                    </button>

                    {showMenu && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-brand-border bg-brand-card py-1 shadow-xl shadow-black/30">
                            <div className="border-b border-brand-border-subtle px-3 py-2.5">
                                <p className="text-sm font-medium text-brand-text">{user?.name}</p>
                                <p className="text-xs text-brand-text-dim">{user?.email}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowMenu(false)
                                    onLogout()
                                }}
                                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs text-brand-text-muted transition-colors hover:bg-brand-border/20 hover:text-brand-text"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
