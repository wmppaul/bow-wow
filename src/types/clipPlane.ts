// Clip plane state for a single axis
export interface ClipPlaneState {
  enabled: boolean;
  position: number; // Position along the axis in mm
}

// Configuration for all three clip planes
export interface ClipPlanesConfig {
  x: ClipPlaneState; // Cuts perpendicular to X axis (shows YZ cross-section)
  y: ClipPlaneState; // Cuts perpendicular to Y axis (shows XZ cross-section)
  z: ClipPlaneState; // Cuts perpendicular to Z axis (shows XY cross-section)
  showCaps: boolean; // Whether to show solid caps at cross-sections
}

// Default configuration - all planes disabled, centered at origin
export const DEFAULT_CLIP_PLANES: ClipPlanesConfig = {
  x: { enabled: false, position: 0 },
  y: { enabled: false, position: 12.5 }, // Mid hull height roughly
  z: { enabled: false, position: 0 },
  showCaps: true, // Show solid caps by default
};
