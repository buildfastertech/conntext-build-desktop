import { useState, useRef, useEffect } from 'react'

interface ResizablePanesProps {
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
  isLeftCollapsed?: boolean
  collapsedWidth?: number
}

export function ResizablePanes({
  leftPane,
  rightPane,
  defaultLeftWidth = 300,
  minLeftWidth = 200,
  minRightWidth = 400,
  isLeftCollapsed = false,
  collapsedWidth = 48
}: ResizablePanesProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [expandedWidth, setExpandedWidth] = useState(defaultLeftWidth)

  // Handle collapse/expand transitions
  useEffect(() => {
    if (isLeftCollapsed) {
      // Store current width before collapsing (only if not already collapsed)
      if (leftWidth > collapsedWidth) {
        setExpandedWidth(leftWidth)
      }
      setLeftWidth(collapsedWidth)
    } else {
      // Restore expanded width
      setLeftWidth(expandedWidth)
    }
  }, [isLeftCollapsed, collapsedWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current || isLeftCollapsed) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = e.clientX - containerRect.left

      // Enforce minimum widths
      const maxLeftWidth = containerRect.width - minRightWidth
      const clampedWidth = Math.max(minLeftWidth, Math.min(newLeftWidth, maxLeftWidth))

      setLeftWidth(clampedWidth)
      setExpandedWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, minLeftWidth, minRightWidth, isLeftCollapsed])

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Left Pane */}
      <div
        style={{
          width: `${leftWidth}px`,
          transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        className="flex-shrink-0 overflow-hidden"
      >
        {leftPane}
      </div>

      {/* Draggable Separator */}
      <div
        onMouseDown={() => !isLeftCollapsed && setIsDragging(true)}
        className="group relative flex-shrink-0"
        style={{
          width: '1px',
          cursor: isLeftCollapsed ? 'default' : 'col-resize',
          opacity: isLeftCollapsed ? 0 : 1,
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 bg-transparent group-hover:bg-brand-purple/20" />
        <div className="h-full w-full bg-brand-border group-hover:bg-brand-purple" />
      </div>

      {/* Right Pane */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          transition: isDragging ? 'none' : 'flex 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {rightPane}
      </div>
    </div>
  )
}
