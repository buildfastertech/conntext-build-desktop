import { useState, useEffect, useRef } from 'react'
import conntextIcon from '../../../../assets/images/desktop-icon.png'

interface MenuItem {
    label: string
    accelerator?: string
    action?: string
    separator?: boolean
}

interface MenuGroup {
    label: string
    items: MenuItem[]
}

const menuTemplate: MenuGroup[] = [
    {
        label: 'File',
        items: [
            { label: 'Open Folder...', accelerator: 'Ctrl+O', action: 'file:open-folder' },
            { separator: true, label: '' },
            { label: 'Exit', accelerator: 'Alt+F4', action: 'app:quit' },
        ],
    },
    {
        label: 'Edit',
        items: [
            { label: 'Undo', accelerator: 'Ctrl+Z', action: 'edit:undo' },
            { label: 'Redo', accelerator: 'Ctrl+Shift+Z', action: 'edit:redo' },
            { separator: true, label: '' },
            { label: 'Cut', accelerator: 'Ctrl+X', action: 'edit:cut' },
            { label: 'Copy', accelerator: 'Ctrl+C', action: 'edit:copy' },
            { label: 'Paste', accelerator: 'Ctrl+V', action: 'edit:paste' },
            { separator: true, label: '' },
            { label: 'Select All', accelerator: 'Ctrl+A', action: 'edit:select-all' },
        ],
    },
    {
        label: 'View',
        items: [
            { label: 'Reload', accelerator: 'Ctrl+R', action: 'window:reload' },
            { separator: true, label: '' },
            { label: 'Zoom In', accelerator: 'Ctrl+=', action: 'window:zoom-in' },
            { label: 'Zoom Out', accelerator: 'Ctrl+-', action: 'window:zoom-out' },
            { label: 'Reset Zoom', accelerator: 'Ctrl+0', action: 'window:zoom-reset' },
            { separator: true, label: '' },
            { label: 'Toggle Full Screen', accelerator: 'F11', action: 'window:toggle-fullscreen' },
            { label: 'Toggle Developer Tools', accelerator: 'Ctrl+Shift+I', action: 'window:toggle-devtools' },
        ],
    },
    {
        label: 'Help',
        items: [
            { label: 'About ConnText Build', action: 'help:about' },
        ],
    },
]

interface TitleMenuBarProps {
    onOpenFolder?: () => void
}

export function TitleMenuBar({ onOpenFolder }: TitleMenuBarProps) {
    const [openMenu, setOpenMenu] = useState<number | null>(null)
    const [hovering, setHovering] = useState(false)
    const barRef = useRef<HTMLDivElement>(null)
    const isMac = window.api.platform === 'darwin'

    const closeMenu = () => {
        setOpenMenu(null)
        setHovering(false)
    }

    const handleMenuClick = (index: number) => {
        if (openMenu === index) {
            setOpenMenu(null)
            setHovering(false)
        } else {
            setOpenMenu(index)
            setHovering(true)
        }
    }

    const handleMenuHover = (index: number) => {
        if (hovering && openMenu !== null) {
            setOpenMenu(index)
        }
    }

    const handleItemClick = (item: MenuItem) => {
        setOpenMenu(null)
        setHovering(false)

        if (item.action === 'file:open-folder' && onOpenFolder) {
            onOpenFolder()
            return
        }

        if (item.action) {
            window.api.executeMenuAction(item.action)
        }
    }

    return (
        <>
        {/* Invisible overlay to catch clicks when menu is open */}
        {openMenu !== null && (
            <div
                className="fixed inset-0 z-[9998]"
                onMouseDown={(e) => {
                    e.stopPropagation()
                    closeMenu()
                }}
            />
        )}
        <div
            ref={barRef}
            className="relative z-[9999] flex h-[44px] items-center bg-[#0e0e14] select-none"
            style={{ WebkitAppRegion: 'drag', paddingLeft: isMac ? 70 : 0 } as React.CSSProperties}
        >
            {/* App icon */}
            <div className="flex items-center justify-center w-12 h-full">
                <img src={conntextIcon} alt="" className="h-5 w-5" />
            </div>

            {/* Menu items */}
            <div
                className="flex items-center h-full"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {menuTemplate.map((menu, index) => (
                    <div key={menu.label} className="relative h-full flex items-center">
                        <button
onClick={() => handleMenuClick(index)}
                            onMouseEnter={() => handleMenuHover(index)}
                            className={`cursor-pointer h-full px-3 text-[13px] transition-colors ${
                                openMenu === index
                                    ? 'bg-white/10 text-white'
                                    : 'text-[#a0a0b8] hover:text-white'
                            }`}
                        >
                            {menu.label}
                        </button>

                        {openMenu === index && (
                            <div className="absolute left-0 top-full z-[9999] min-w-[220px] rounded-md border border-[#2a2a3e] bg-[#1a1a2e] py-1 shadow-2xl shadow-black/50">
                                {menu.items.map((item, itemIndex) =>
                                    item.separator ? (
                                        <div
                                            key={itemIndex}
                                            className="mx-2 my-1 border-t border-[#2a2a3e]"
                                        />
                                    ) : (
                                        <button
                                            key={itemIndex}
                                            onClick={() => handleItemClick(item)}
                                            className="flex w-full cursor-pointer items-center justify-between px-4 py-1.5 text-[13px] text-[#c0c0d8] transition-colors hover:bg-brand-purple/20 hover:text-white"
                                        >
                                            <span>{item.label}</span>
                                            {item.accelerator && (
                                                <span className="ml-8 text-[11px] text-[#606078]">
                                                    {item.accelerator}
                                                </span>
                                            )}
                                        </button>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
        </>
    )
}
