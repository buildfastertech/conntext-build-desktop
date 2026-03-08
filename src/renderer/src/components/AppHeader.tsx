import { useState, useEffect, useRef } from 'react'
import { Brain, FolderOpen, Zap, RefreshCw, ChevronDown, Building2, User, Check, ArrowLeft } from 'lucide-react'
import type { UserInfo, Workspace } from '../../../preload/index.d'

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

    const wsInitial = activeWorkspace?.name?.charAt(0)?.toUpperCase() ?? '?'

    return (
        <div className="flex items-center justify-between border-b border-brand-border bg-[#0e0e14] px-4 py-2">
            {/* Left side */}
            <div className="flex items-center gap-2">
                {/* Back button when in build mode */}
                {onBackToProjects && (
                    <button
                        onClick={onBackToProjects}
                        className="cursor-pointer rounded-lg p-1.5 text-brand-text-dim transition-colors hover:bg-white/5 hover:text-brand-text"
                        title="Back to Projects"
                    >
                        <ArrowLeft size={16} />
                    </button>
                )}

                {/* Workspace Selector */}
                {activeWorkspace ? (
                    <div className="relative" ref={workspaceRef}>
                        <button
                            onClick={() => setShowWorkspaceSwitcher(!showWorkspaceSwitcher)}
                            className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-white/[0.04]"
                            title={activeWorkspace.name}
                        >
                            {/* Workspace avatar */}
                            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-purple/30 to-brand-purple/10 ring-1 ring-brand-purple/20">
                                {activeWorkspace.workspace_type === 'personal'
                                    ? <User size={15} className="text-brand-purple-soft" />
                                    : <span className="text-sm font-bold text-brand-purple-soft">{wsInitial}</span>
                                }
                                {/* Online indicator */}
                                <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0e0e14] bg-emerald-400" />
                            </div>

                            {/* Workspace info */}
                            <div className="text-left min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-semibold text-brand-text truncate max-w-[180px]">
                                        {activeWorkspace.name}
                                    </span>
                                    <ChevronDown
                                        size={13}
                                        className={`text-brand-text-dim transition-transform duration-200 ${showWorkspaceSwitcher ? 'rotate-180' : ''}`}
                                    />
                                </div>
                                <div className="text-[11px] text-brand-text-muted truncate max-w-[220px]">
                                    {workingDirectory ? (
                                        <span className="flex items-center gap-1">
                                            <FolderOpen size={10} className="shrink-0 text-brand-purple/60" />
                                            {getDirectoryName(workingDirectory)}
                                        </span>
                                    ) : (
                                        <span className="text-amber-400/70">No project folder selected</span>
                                    )}
                                </div>
                            </div>
                        </button>

                        {/* Workspace Dropdown */}
                        {showWorkspaceSwitcher && (
                            <div className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-brand-border/60 bg-[#12121a] shadow-2xl shadow-black/50">
                                {/* Dropdown header */}
                                <div className="border-b border-brand-border/40 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-text-dim/70">
                                        Switch Workspace
                                    </p>
                                </div>

                                <div className="py-1.5">
                                    {/* Active workspace */}
                                    <div className="mx-2 rounded-lg bg-brand-purple/[0.08] px-3 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-purple/30 to-brand-purple/10 ring-1 ring-brand-purple/25">
                                                {activeWorkspace.workspace_type === 'personal'
                                                    ? <User size={15} className="text-brand-purple-soft" />
                                                    : <span className="text-sm font-bold text-brand-purple-soft">{wsInitial}</span>
                                                }
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[13px] font-semibold text-brand-text truncate">{activeWorkspace.name}</div>
                                                <div className="text-[10px] text-brand-text-dim capitalize">{activeWorkspace.workspace_type} workspace</div>
                                            </div>
                                            <Check size={15} className="shrink-0 text-brand-purple" />
                                        </div>
                                    </div>

                                    {/* Other workspaces */}
                                    {workspaces.filter(ws => ws.id !== activeWorkspace.id).length > 0 && (
                                        <>
                                            <div className="mx-4 my-2 border-t border-brand-border/20" />
                                            {workspaces
                                                .filter(ws => ws.id !== activeWorkspace.id)
                                                .map(ws => {
                                                    const wsI = ws.name?.charAt(0)?.toUpperCase() ?? '?'
                                                    return (
                                                        <button
                                                            key={ws.id}
                                                            onClick={() => {
                                                                setShowWorkspaceSwitcher(false)
                                                                onSwitchWorkspace?.(ws)
                                                            }}
                                                            className="mx-2 flex w-[calc(100%-16px)] cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 hover:bg-white/[0.04]"
                                                        >
                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                                                                {ws.workspace_type === 'personal'
                                                                    ? <User size={15} className="text-brand-text-dim" />
                                                                    : <span className="text-sm font-bold text-brand-text-dim">{wsI}</span>
                                                                }
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[13px] text-brand-text truncate">{ws.name}</div>
                                                                <div className="text-[10px] text-brand-text-dim capitalize">{ws.workspace_type} workspace</div>
                                                            </div>
                                                        </button>
                                                    )
                                                })
                                            }
                                        </>
                                    )}

                                    {workspaces.length === 0 && (
                                        <div className="px-4 py-4 text-xs text-brand-text-dim/60 text-center">
                                            No other workspaces available
                                        </div>
                                    )}
                                </div>

                                {/* Back to projects footer */}
                                {onBackToProjects && (
                                    <div className="border-t border-brand-border/30">
                                        <button
                                            onClick={() => {
                                                setShowWorkspaceSwitcher(false)
                                                onBackToProjects()
                                            }}
                                            className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-xs text-brand-text-dim transition-colors hover:bg-white/[0.03] hover:text-brand-text-muted"
                                        >
                                            <ArrowLeft size={13} />
                                            <span>Back to project list</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="px-2">
                        <h1 className="text-sm font-semibold text-brand-text">ConnText Build</h1>
                        <p className="text-[11px] text-brand-text-dim">Select a project to get started</p>
                    </div>
                )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-0.5">
                {/* Memory (only show when project is selected) */}
                {workingDirectory && onOpenMemory && (
                    <button
                        onClick={onOpenMemory}
                        className="relative cursor-pointer rounded-lg p-2 text-brand-text-dim transition-colors hover:bg-white/[0.04] hover:text-brand-text-muted"
                        title="Memory"
                    >
                        <Brain size={18} />
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
                            className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/[0.04]"
                            title="Agent Skills"
                        >
                            <Zap
                                size={18}
                                className={skillsCount === 0 ? 'text-red-500' : 'text-green-500'}
                            />
                        </button>

                        {showSkillsPopover && (
                            <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-brand-border/60 bg-[#12121a] shadow-2xl shadow-black/50">
                                <div className="border-b border-brand-border/30 px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-brand-purple" />
                                        <h4 className="text-[13px] font-semibold text-brand-text">Agent Skills</h4>
                                    </div>
                                </div>
                                <div className="px-4 py-3 space-y-2 text-xs text-brand-text-muted">
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
                                <div className="border-t border-brand-border/30 px-4 py-3">
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
                            </div>
                        )}
                    </div>
                )}

                {/* Settings */}
                {onOpenSettings && (
                    <button
                        onClick={onOpenSettings}
                        className="cursor-pointer rounded-lg p-2 text-brand-text-dim transition-colors hover:bg-white/[0.04] hover:text-brand-text-muted"
                        title="Settings"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                )}

                {/* Divider */}
                <div className="mx-1.5 h-5 w-px bg-white/[0.06]" />

                {/* Profile */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
                    >
                        <span className="text-xs text-brand-text-muted">{user?.name ?? 'Unknown'}</span>
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-purple/20 text-[11px] font-semibold text-brand-purple ring-1 ring-brand-purple/15">
                            {initials}
                        </div>
                    </button>

                    {showMenu && (
                        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-brand-border/60 bg-[#12121a] shadow-2xl shadow-black/50">
                            <div className="border-b border-brand-border/30 px-4 py-3">
                                <p className="text-[13px] font-medium text-brand-text">{user?.name}</p>
                                <p className="text-[11px] text-brand-text-dim">{user?.email}</p>
                            </div>
                            <div className="py-1">
                                <button
                                    onClick={() => {
                                        setShowMenu(false)
                                        onLogout()
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-xs text-brand-text-muted transition-colors hover:bg-white/[0.04] hover:text-brand-text"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                        <polyline points="16 17 21 12 16 7" />
                                        <line x1="21" y1="12" x2="9" y2="12" />
                                    </svg>
                                    Disconnect
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
