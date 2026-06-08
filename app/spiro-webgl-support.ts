export type WebglContextName = 'webgl2' | 'webgl' | 'experimental-webgl';

export interface WebglSupportResult {
  supported: boolean;
  contextName: WebglContextName | null;
  reason?: string;
  renderer?: string;
  vendor?: string;
}

export interface WebglContextLossHandlers {
  onContextLost?: (event: WebGLContextEvent) => void;
  onContextRestored?: (event: WebGLContextEvent) => void;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  depth: true,
  failIfMajorPerformanceCaveat: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
  stencil: false,
};

function getContextName(context: RenderingContext): WebglContextName {
  if (typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext) {
    return 'webgl2';
  }

  return 'webgl';
}

function readContextParameter(context: WebGLRenderingContext | WebGL2RenderingContext, parameter: number): string {
  try {
    return String(context.getParameter(parameter) ?? '');
  } catch {
    return '';
  }
}

function releaseProbeContext(context: WebGLRenderingContext | WebGL2RenderingContext): void {
  try {
    context.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // The probe context is best-effort only; support detection should not fail if it cannot be released.
  }
}

export function detectWebglSupport(): WebglSupportResult {
  if (typeof document === 'undefined') {
    return {
      supported: false,
      contextName: null,
      reason: 'document-unavailable',
    };
  }

  const canvas = document.createElement('canvas');

  try {
    const context =
      canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) ??
      canvas.getContext('webgl', CONTEXT_ATTRIBUTES) ??
      canvas.getContext('experimental-webgl', CONTEXT_ATTRIBUTES);

    if (!context) {
      return {
        supported: false,
        contextName: null,
        reason: 'context-unavailable',
      };
    }

    const gl = context as WebGLRenderingContext | WebGL2RenderingContext;
    const result = {
      supported: true,
      contextName: getContextName(context),
      renderer: readContextParameter(gl, gl.RENDERER),
      vendor: readContextParameter(gl, gl.VENDOR),
    };

    releaseProbeContext(gl);

    return result;
  } catch (error) {
    return {
      supported: false,
      contextName: null,
      reason: error instanceof Error ? error.message : 'context-error',
    };
  }
}

export function attachWebglContextLossHandlers(
  canvas: HTMLCanvasElement,
  handlers: WebglContextLossHandlers
): () => void {
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    handlers.onContextLost?.(event as WebGLContextEvent);
  };

  const handleContextRestored = (event: Event) => {
    handlers.onContextRestored?.(event as WebGLContextEvent);
  };

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleContextLost, false);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
  };
}
