import { useState, useRef, useEffect } from 'react'

interface ResizablePanesProps {
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
}

export function ResizablePanes({
  leftPane,
  rightPane,
  defaultLeftWidth = 300,
  minLeftWidth = 200,
  minRightWidth = 400
}: ResizablePanesProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = e.clientX - containerRect.left

      // Enforce minimum widths
      const maxLeftWidth = containerRect.width - minRightWidth
      const clampedWidth = Math.max(minLeftWidth, Math.min(newLeftWidth, maxLeftWidth))

      setLeftWidth(clampedWidth)
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
  }, [isDragging, minLeftWidth, minRightWidth])

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Left Pane */}
      <div
        style={{ width: `${leftWidth}px` }}
        className="flex-shrink-0 overflow-hidden"
      >
        {leftPane}
      </div>

      {/* Draggable Separator */}
      <div
        onMouseDown={() => setIsDragging(true)}
        className="group relative flex-shrink-0 cursor-col-resize"
        style={{ width: '1px' }}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 bg-transparent group-hover:bg-brand-purple/20" />
        <div className="h-full w-full bg-brand-border group-hover:bg-brand-purple" />
      </div>

      {/* Right Pane */}
      <div className="flex-1 overflow-hidden">
        {rightPane}
      </div>
    </div>
  )
}
