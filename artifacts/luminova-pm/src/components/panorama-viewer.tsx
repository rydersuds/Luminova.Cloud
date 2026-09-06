import * as React from "react"
import { LoaderCircle, Minus, Move, Pencil, Plus, RotateCcw } from "lucide-react"

type Panorama = {
  url: string
  label: string | null
  location: string | null
  date: string | null
}

type View = { yaw: number; pitch: number; fieldOfView: number }

const INITIAL_FIELD_OF_VIEW = 1.15
const MIN_FIELD_OF_VIEW = 0.45
const MAX_FIELD_OF_VIEW = 1.35
const ZOOM_STEP = 0.12

const vertexShaderSource = `
  attribute vec2 position;
  varying vec2 screenPosition;
  void main() {
    screenPosition = position;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragmentShaderSource = `
  precision highp float;
  varying vec2 screenPosition;
  uniform sampler2D panorama;
  uniform vec2 viewport;
  uniform float yaw;
  uniform float pitch;
  uniform float fieldOfView;

  void main() {
    float aspect = viewport.x / viewport.y;
    vec3 ray = normalize(vec3(screenPosition.x * aspect * fieldOfView, screenPosition.y * fieldOfView, -1.0));

    float cp = cos(pitch);
    float sp = sin(pitch);
    ray = vec3(ray.x, ray.y * cp - ray.z * sp, ray.y * sp + ray.z * cp);

    float cy = cos(yaw);
    float sy = sin(yaw);
    ray = vec3(ray.x * cy - ray.z * sy, ray.y, ray.x * sy + ray.z * cy);

    float longitude = atan(ray.x, -ray.z);
    float latitude = asin(clamp(ray.y, -1.0, 1.0));
    vec2 uv = vec2(fract(longitude / 6.28318530718 + 0.5), latitude / 3.14159265359 + 0.5);
    gl_FragColor = texture2D(panorama, uv);
  }
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("Unable to create panorama shader.")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unable to compile panorama shader."
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  const program = gl.createProgram()
  if (!program) throw new Error("Unable to create panorama renderer.")
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unable to link panorama renderer."
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

const clampPitch = (pitch: number) => Math.max(-85, Math.min(85, pitch))
const wrapYaw = (yaw: number) => ((yaw % 360) + 360) % 360
const clampFieldOfView = (fieldOfView: number) =>
  Math.max(MIN_FIELD_OF_VIEW, Math.min(MAX_FIELD_OF_VIEW, fieldOfView))

export function PanoramaViewer({
  panorama,
  formatDate,
  onEdit,
}: {
  panorama: Panorama
  formatDate: (date: string) => string
  onEdit: () => void
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const renderRef = React.useRef<((view: View) => void) | null>(null)
  const viewRef = React.useRef<View>({ yaw: 0, pitch: 0, fieldOfView: INITIAL_FIELD_OF_VIEW })
  const dragRef = React.useRef<{ pointerId: number; x: number; y: number; view: View } | null>(null)
  const pointersRef = React.useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = React.useRef<{ distance: number; fieldOfView: number } | null>(null)
  const [view, setView] = React.useState<View>({ yaw: 0, pitch: 0, fieldOfView: INITIAL_FIELD_OF_VIEW })
  const [status, setStatus] = React.useState<"loading" | "ready" | "restoring" | "error" | "restore-error">("loading")
  const [renderAttempt, setRenderAttempt] = React.useState(0)
  const lastPanoramaUrlRef = React.useRef<string | null>(null)
  const displayLabel = panorama.label || "Untitled panorama"

  const updateView = React.useCallback((next: View) => {
    const normalized = {
      yaw: wrapYaw(next.yaw),
      pitch: clampPitch(next.pitch),
      fieldOfView: clampFieldOfView(next.fieldOfView),
    }
    viewRef.current = normalized
    setView(normalized)
    renderRef.current?.(normalized)
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setStatus("loading")
    if (lastPanoramaUrlRef.current !== panorama.url) {
      lastPanoramaUrlRef.current = panorama.url
      updateView({ yaw: 0, pitch: 0, fieldOfView: INITIAL_FIELD_OF_VIEW })
    }

    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: true,
        powerPreference: "high-performance",
      })
    } catch {
      setStatus("error")
      return
    }
    if (!gl) {
      setStatus("error")
      return
    }

    let program: WebGLProgram | null = null
    let texture: WebGLTexture | null = null
    let buffer: WebGLBuffer | null = null
    let resizeFrame: number | null = null
    let disposed = false
    const image = new Image()
    image.crossOrigin = "anonymous"

    const releaseResources = () => {
      renderRef.current = null
      try {
        if (texture) gl.deleteTexture(texture)
        if (buffer) gl.deleteBuffer(buffer)
        if (program) gl.deleteProgram(program)
      } catch {
        // A lost graphics context may reject cleanup; resources are already unusable.
      }
      texture = null
      buffer = null
      program = null
    }

    const initializeRenderer = (restoring: boolean) => {
      try {
        releaseResources()
        program = createProgram(gl)
        buffer = gl.createBuffer()
        texture = gl.createTexture()
        if (!buffer || !texture) throw new Error("Unable to allocate panorama rendering resources.")

        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, "position")
        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        // The shader wraps longitude with fract(), allowing non-power-of-two uploads in WebGL 1.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)

        const yawLocation = gl.getUniformLocation(program, "yaw")
        const pitchLocation = gl.getUniformLocation(program, "pitch")
        const viewportLocation = gl.getUniformLocation(program, "viewport")
        const fieldOfViewLocation = gl.getUniformLocation(program, "fieldOfView")
        const render = (currentView: View) => {
          if (disposed) return
          try {
            if (gl.isContextLost()) return
            const width = Math.max(1, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)))
            const height = Math.max(1, Math.round(canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2)))
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width
              canvas.height = height
            }
            gl.viewport(0, 0, width, height)
            gl.uniform2f(viewportLocation, width, height)
            gl.uniform1f(yawLocation, currentView.yaw * Math.PI / 180)
            gl.uniform1f(pitchLocation, currentView.pitch * Math.PI / 180)
            gl.uniform1f(fieldOfViewLocation, currentView.fieldOfView)
            gl.drawArrays(gl.TRIANGLES, 0, 6)
          } catch {
            releaseResources()
            if (!disposed) setStatus(restoring ? "restore-error" : "error")
          }
        }
        renderRef.current = render
        render(viewRef.current)
        setStatus("ready")
      } catch {
        releaseResources()
        setStatus(restoring ? "restore-error" : "error")
      }
    }

    image.onload = () => {
      if (!disposed) initializeRenderer(false)
    }
    image.onerror = () => !disposed && setStatus("error")
    try {
      image.src = panorama.url
    } catch {
      setStatus("error")
    }

    const handleContextLost = (event: WebGLContextEvent) => {
      event.preventDefault()
      dragRef.current = null
      pointersRef.current.clear()
      pinchRef.current = null
      renderRef.current = null
      setStatus("restoring")
    }
    const handleContextRestored = () => {
      if (!disposed && image.complete && image.naturalWidth > 0) initializeRenderer(true)
    }
    canvas.addEventListener("webglcontextlost", handleContextLost)
    canvas.addEventListener("webglcontextrestored", handleContextRestored)

    let resizeObserver: ResizeObserver | null = null
    try {
      resizeObserver = new ResizeObserver(() => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null
          renderRef.current?.(viewRef.current)
        })
      })
      resizeObserver.observe(canvas)
    } catch {
      setStatus("error")
    }

    return () => {
      disposed = true
      image.onload = null
      image.onerror = null
      renderRef.current = null
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      try {
        resizeObserver?.disconnect()
      } catch {
        // The observer may already be detached while the dialog is closing.
      }
      canvas.removeEventListener("webglcontextlost", handleContextLost)
      canvas.removeEventListener("webglcontextrestored", handleContextRestored)
      releaseResources()
    }
  }, [panorama.url, renderAttempt, updateView])

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId) === false) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic accessibility tests may not register an active hardware pointer.
      }
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      pinchRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        fieldOfView: viewRef.current.fieldOfView,
      }
      dragRef.current = null
      return
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current }
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [first, second] = [...pointersRef.current.values()]
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      if (distance > 0) {
        updateView({
          ...viewRef.current,
          fieldOfView: pinchRef.current.fieldOfView * pinchRef.current.distance / distance,
        })
      }
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateView({
      yaw: drag.view.yaw - (event.clientX - drag.x) * 0.2,
      pitch: drag.view.pitch + (event.clientY - drag.y) * 0.16,
      fieldOfView: drag.view.fieldOfView,
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    pinchRef.current = null
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const zoomBy = React.useCallback((amount: number) => {
    updateView({ ...viewRef.current, fieldOfView: viewRef.current.fieldOfView + amount })
  }, [updateView])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const movement: Record<string, View> = {
      ArrowLeft: { ...viewRef.current, yaw: viewRef.current.yaw - 10 },
      ArrowRight: { ...viewRef.current, yaw: viewRef.current.yaw + 10 },
      ArrowUp: { ...viewRef.current, pitch: viewRef.current.pitch + 8 },
      ArrowDown: { ...viewRef.current, pitch: viewRef.current.pitch - 8 },
    }
    const next = movement[event.key]
    if (!next) return
    event.preventDefault()
    updateView(next)
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div
        role="application"
        tabIndex={0}
        aria-label={`360 degree viewer for ${displayLabel}. Drag in any direction or use the arrow keys to look around. Use the labeled controls to zoom.`}
        className="relative flex-1 min-h-0 cursor-grab touch-none select-none overflow-hidden outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(event) => {
          event.preventDefault()
          zoomBy(event.deltaY * 0.0015)
        }}
        onKeyDown={handleKeyDown}
        data-view-yaw={view.yaw.toFixed(1)}
        data-view-pitch={view.pitch.toFixed(1)}
        data-field-of-view={view.fieldOfView.toFixed(2)}
        data-render-status={status}
      >
        <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
        {(status === "loading" || status === "restoring") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-sm text-white/80" role="status">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            {status === "restoring" ? "Restoring panorama…" : "Loading panorama…"}
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center text-sm text-white/80" role="alert">
            This panorama could not be rendered. Try closing it and opening it again.
          </div>
        )}
        {status === "restore-error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-sm text-white/80" role="alert">
            <p>The panorama renderer could not recover after the device graphics restarted.</p>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setRenderAttempt(attempt => attempt + 1)
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Retry panorama
            </button>
          </div>
        )}
        <div className="pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm">
          <Move className="h-4 w-4" />
          Drag or use arrow keys to look around
        </div>
        <div className="absolute bottom-5 right-5 flex overflow-hidden rounded-lg border border-white/20 bg-black/65 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            aria-label="Zoom out"
            className="flex h-10 w-10 items-center justify-center text-white transition-colors hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              zoomBy(ZOOM_STEP)
            }}
            disabled={view.fieldOfView >= MAX_FIELD_OF_VIEW}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="flex h-10 w-10 items-center justify-center border-l border-white/20 text-white transition-colors hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              zoomBy(-ZOOM_STEP)
            }}
            disabled={view.fieldOfView <= MIN_FIELD_OF_VIEW}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-t border-white/15 px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{displayLabel}</p>
            <p className="mt-1 text-xs text-white/55">{panorama.location || "Location not provided"}</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-white/55">{panorama.date ? formatDate(panorama.date) : "Capture date not provided"}</p>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit details
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}