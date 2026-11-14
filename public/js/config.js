export const DEFAULTS = {
  transition: {
    distortionStrength: 0.4,
    rgbShift: 0,
    distortionScale: 0.28,
  },
  scroll: {
    wheel: 0.8,
    touch: 4,
    snapDelay: 0.1,
    lerp: 0.1,
  },
  gallery: {
    ease: 0.07,
    wheel: 0.0252,
    wheelScale: 0.556,
    drag: 0.05,
    curve: 152,
    curveFlat: 0.4,
    latency: 0.12,
    latencyMax: 3,
    latencyEase: 0.07,
    wheelEnd: 0.15,
    snap: 0.155,
    cameraZ: 600,
    segments: 100,
  },
  zoom: {
    duration: 1.8,
  },
  stepper: {
    lead: 0.6,
    leadEase: 'expo.out',
    trail: 0.8,
    trailEase: 'expo.out',
    trailDelay: 0.08,
    lines: 0.7,
    linesEase: 'expo.out',
  },
  sound: {
    file: 'App Interface Button 2.wav',
    volume: 0.2,
  },
  hover: {
    mouse: 0.07,
    area: 0.05,
    dmax: 1.8,
    winGl: 4.14214,
  },
};
export const OVERLAY = { color: [11 / 255, 11 / 255, 11 / 255], opacity: 0.4 };

export function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}
