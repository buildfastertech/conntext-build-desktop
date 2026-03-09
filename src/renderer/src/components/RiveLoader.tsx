import { useEffect, useState } from 'react'
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas'
import riveAssetUrl from '../../../../assets/images/conntext_loader.riv'

// Module-level cache so multiple RiveLoader instances share one fetch
let cachedBuffer: ArrayBuffer | null = null
let bufferPromise: Promise<ArrayBuffer> | null = null

function loadRiveBuffer(): Promise<ArrayBuffer> {
  if (cachedBuffer) return Promise.resolve(cachedBuffer)
  if (!bufferPromise) {
    bufferPromise = fetch(riveAssetUrl)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        cachedBuffer = buf
        return buf
      })
  }
  return bufferPromise
}

const sizeClasses = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-8',
  lg: 'size-12',
  xl: 'size-16',
  full: 'size-full',
} as const

type RiveLoaderSize = keyof typeof sizeClasses

interface RiveLoaderProps extends React.ComponentProps<'div'> {
  size?: RiveLoaderSize
  stateMachine?: string
  animationName?: string
}

// Inner component — useRive is always called with valid params, never null
function RiveCanvas({
  buffer,
  stateMachine,
  animationName,
}: {
  buffer: ArrayBuffer
  stateMachine?: string
  animationName?: string
}) {
  const { RiveComponent } = useRive({
    buffer,
    autoplay: true,
    ...(stateMachine ? { stateMachines: stateMachine } : {}),
    ...(animationName ? { animations: animationName } : {}),
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  })

  if (!RiveComponent) return null
  return <RiveComponent className="size-full" />
}

export function RiveLoader({
  className = '',
  size = 'md',
  stateMachine,
  animationName,
  ...props
}: RiveLoaderProps) {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(cachedBuffer)

  useEffect(() => {
    if (!buffer) {
      loadRiveBuffer()
        .then((buf) => setBuffer(buf))
        .catch((err) => console.error('Failed to load Rive asset:', err))
    }
  }, [])

  const classes = `inline-flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className}`.trim()

  return (
    <div className={classes} {...props}>
      {buffer ? (
        <RiveCanvas buffer={buffer} stateMachine={stateMachine} animationName={animationName} />
      ) : (
        <div className="size-3/4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
    </div>
  )
}
