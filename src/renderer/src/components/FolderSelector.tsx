import { useState, useEffect, useRef } from 'react'
import { FolderOpen, X, ChevronDown } from 'lucide-react'

interface FolderSelectorProps {
  /** Folders currently active (sent to the agent as context) */
  activeFolders: string[]
  /** All folders the user has chosen to show as chips */
  chosenFolders: string[]
  onActiveFoldersChange: (folders: string[]) => void
  onChosenFoldersChange: (folders: string[]) => void
  projectId: string | null
  workingDirectory: string | null
  disabled?: boolean
}

export function FolderSelector({
  activeFolders,
  chosenFolders,
  onActiveFoldersChange,
  onChosenFoldersChange,
  projectId,
  workingDirectory,
  disabled
}: FolderSelectorProps) {
  const [availableFolders, setAvailableFolders] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch folders from API or scan local directory
  useEffect(() => {
    const fetchFolders = async () => {
      setIsLoading(true)
      try {
        // Try API first if we have a projectId
        if (projectId) {
          const credentials = await window.api.getCredentials()
          if (credentials) {
            try {
              const response = await fetch(`${credentials.apiUrl}/api/projects/${projectId}/folders`, {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${credentials.apiToken}`
                }
              })

              if (response.ok) {
                const data = await response.json()
                const folders = data.folders || []
                if (folders.length > 0) {
                  setAvailableFolders(folders)
                  return
                }
              }
            } catch {
              // API failed, fall through to local scan
            }
          }
        }

        // Fallback: scan local working directory for top-level folders
        if (workingDirectory) {
          const dirs = await window.api.listDirectories(workingDirectory)
          setAvailableFolders(dirs)
        }
      } catch {
        // Silently fail
      } finally {
        setIsLoading(false)
      }
    }

    fetchFolders()
  }, [projectId, workingDirectory])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (availableFolders.length === 0) return null

  /** Toggle a folder in/out of the chosen set (from dropdown) */
  const toggleChosen = (folder: string) => {
    if (chosenFolders.includes(folder)) {
      // Remove from chosen AND active
      onChosenFoldersChange(chosenFolders.filter(f => f !== folder))
      onActiveFoldersChange(activeFolders.filter(f => f !== folder))
    } else {
      // Add to both chosen and active
      onChosenFoldersChange([...chosenFolders, folder])
      onActiveFoldersChange([...activeFolders, folder])
    }
  }

  /** Toggle a chip on/off (stays in chosen set, just toggles active state) */
  const toggleActive = (folder: string) => {
    if (activeFolders.includes(folder)) {
      onActiveFoldersChange(activeFolders.filter(f => f !== folder))
    } else {
      onActiveFoldersChange([...activeFolders, folder])
    }
  }

  /** Remove a folder chip entirely */
  const removeChosen = (folder: string) => {
    onChosenFoldersChange(chosenFolders.filter(f => f !== folder))
    onActiveFoldersChange(activeFolders.filter(f => f !== folder))
  }

  const activeCount = activeFolders.length

  return (
    <div className="border-b border-brand-border/30 px-3 py-2">
      <div className="relative" ref={dropdownRef}>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Chosen folder chips — click to toggle active, × to remove */}
          {chosenFolders.map(folder => {
            const isActive = activeFolders.includes(folder)
            return (
              <span
                key={folder}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px] font-medium tracking-tight transition-all ${
                  isActive
                    ? 'bg-brand-purple/12 text-brand-purple-soft border border-brand-purple/20'
                    : 'bg-brand-border/20 text-brand-text-dim line-through border border-brand-border/30 opacity-60'
                }`}
              >
                <button
                  onClick={() => toggleActive(folder)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 cursor-pointer"
                  title={isActive ? `Disable ${folder}` : `Enable ${folder}`}
                >
                  <FolderOpen size={13} className="shrink-0 opacity-70" />
                  <span className="-mt-px">{folder}</span>
                </button>
                <button
                  onClick={() => removeChosen(folder)}
                  disabled={disabled}
                  className="cursor-pointer rounded p-0.5 opacity-40 transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
                  title={`Remove ${folder}`}
                >
                  <X size={12} />
                </button>
              </span>
            )
          })}

          {/* Add folders button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={disabled || isLoading}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-brand-border/50 px-2.5 py-1 text-[13px] text-brand-text-dim transition-colors hover:border-brand-purple/30 hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen size={13} />
            <span>{chosenFolders.length > 0 ? 'Edit' : 'Folders'}</span>
            <ChevronDown size={11} />
          </button>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-lg border border-brand-border bg-brand-card shadow-xl">
            {/* Header with actions */}
            <div className="flex items-center justify-between border-b border-brand-border/50 px-3 py-1.5">
              <span className="text-[11px] font-medium text-brand-text-muted">Folder context</span>
              <div className="flex gap-2 text-[11px]">
                <button
                  onClick={() => {
                    onChosenFoldersChange([...availableFolders])
                    onActiveFoldersChange([...availableFolders])
                  }}
                  className="cursor-pointer text-brand-purple hover:text-brand-purple-soft"
                >
                  All
                </button>
                <button
                  onClick={() => {
                    onChosenFoldersChange([])
                    onActiveFoldersChange([])
                  }}
                  className="cursor-pointer text-brand-text-dim hover:text-brand-text-muted"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Folder list */}
            <div className="max-h-48 overflow-y-auto p-1.5">
              {availableFolders.map(folder => (
                <label
                  key={folder}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-text transition-colors hover:bg-brand-purple/10"
                >
                  <input
                    type="checkbox"
                    checked={chosenFolders.includes(folder)}
                    onChange={() => toggleChosen(folder)}
                    className="h-3.5 w-3.5 rounded border-brand-border accent-brand-purple"
                  />
                  <FolderOpen size={13} className="text-brand-text-dim" />
                  <span>{folder}</span>
                </label>
              ))}
            </div>

            {/* Footer hint */}
            <div className="border-t border-brand-border/50 px-3 py-1.5">
              <span className="text-[10px] text-brand-text-dim">
                {activeCount === 0
                  ? 'No filter \u2014 entire project'
                  : `${activeCount} folder${activeCount !== 1 ? 's' : ''} active`
                }
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
