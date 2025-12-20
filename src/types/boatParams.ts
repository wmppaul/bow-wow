// Version for save/load compatibility
export const PARAMS_VERSION = 1;

// Bow type options
export type BowType = 'plumb' | 'raked' | 'deepV';

export interface BoatParams {
  // Build plate constraint
  buildPlateSize: number; // mm, square plate

  // Hull dimensions
  boatLength: number; // overall length in mm
  beam: number; // width in mm
  hullHeight: number; // total height in mm
  wallThickness: number; // mm

  // Bilge (rounded bottom corners)
  bilgeRadius: number; // mm, 0 = sharp corners

  // Bow configuration
  bowType: BowType;
  bowLengthPercent: number; // 20-60% of total length
  bowRakeAngle: number; // degrees, for raked bow
  bowEntryAngle: number; // degrees, for deep V bow

  // Motor mount
  motorMountDiameter: number; // mm, cylinder diameter
  motorMountOffset: number; // mm, below hull bottom
  motorMountNeckWidth: number; // mm, rectangular neck width
  motorMountLength: number; // mm, extrusion along boat axis
  motorMountFromStern: number; // mm, distance from stern

  // Physics inputs
  motorWeight: number; // grams
  batteryWeight: number; // grams
  ballastWeight: number; // grams (pennies)
}

// Default parameters
export const DEFAULT_PARAMS: BoatParams = {
  // Build plate
  buildPlateSize: 140,

  // Hull dimensions
  boatLength: 150,
  beam: 40,
  hullHeight: 25,
  wallThickness: 1.2,

  // Bilge
  bilgeRadius: 5,

  // Bow
  bowType: 'plumb',
  bowLengthPercent: 40,
  bowRakeAngle: 30,
  bowEntryAngle: 20,

  // Motor mount
  motorMountDiameter: 4,
  motorMountOffset: 1,
  motorMountNeckWidth: 3,
  motorMountLength: 22,
  motorMountFromStern: 50,

  // Physics
  motorWeight: 10,
  batteryWeight: 23,
  ballastWeight: 0,
};

// Calculate max length based on build plate and beam (diagonal fit with optimal positioning)
export function calculateMaxLength(buildPlateSize: number, beam: number): number {
  // With optimal positioning (boat shifted by beam/4 toward bow on 45° rotated plate):
  // - Wide stern is closer to plate center where there's more horizontal space
  // - Narrow bow extends toward plate tip
  // Constraint: length ≤ plateSize * √2 - beam/2
  const maxLength = buildPlateSize * Math.SQRT2 - beam / 2;
  return Math.max(0, maxLength);
}

// PLA density in g/cm³
export const PLA_DENSITY = 1.25;

// Penny weight in grams
export const PENNY_WEIGHT = 2.5;

// Save file structure
export interface SaveFile {
  version: number;
  params: Partial<BoatParams>;
  savedAt: string;
}

// Merge saved params with defaults (handles missing params from older versions)
export function loadParams(saved: Partial<BoatParams>): BoatParams {
  return { ...DEFAULT_PARAMS, ...saved };
}
