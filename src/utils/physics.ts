import type { BoatParams } from '../types/boatParams';
import { PLA_DENSITY } from '../types/boatParams';

/**
 * Calculate cross-sectional area of hull at a given height
 * This accounts for the bilge radius
 */
function calculateCrossSectionArea(
  beam: number,
  bilgeRadius: number,
  atHeight: number
): number {
  if (atHeight <= 0) return 0;

  const halfBeam = beam / 2;
  const r = Math.min(bilgeRadius, halfBeam, atHeight);

  if (r <= 0) {
    // Simple rectangle
    return beam * atHeight;
  }

  if (atHeight <= r) {
    // Height is within the bilge curve region
    // Area = rectangular center + two partial circle segments
    const centerWidth = beam - 2 * r;
    const centerArea = centerWidth * atHeight;

    // For each corner: area of circular segment from 0 to atHeight
    // Using integral of chord width: 2 * integral of sqrt(r² - (r-y)²) dy from 0 to h
    // = 2 * [r² * arcsin((h-r)/r) + (h-r)*sqrt(r²-(h-r)²)]/2 evaluated
    // Simplified: use numeric approximation
    const cornerArea = calculateCornerArea(r, atHeight);
    return centerArea + 2 * cornerArea;
  } else {
    // Height is above bilge curve
    // Full rectangle minus the corner cuts, plus quarter circle areas
    const cornerCut = r * r; // Square corner that would be there
    const quarterCircle = (Math.PI * r * r) / 4; // Actual quarter circle
    const cornerCorrection = 2 * (quarterCircle - cornerCut); // What we add back

    return beam * atHeight + cornerCorrection;
  }
}

/**
 * Calculate the area of a bilge corner from y=0 to y=height
 * where the corner is a quarter circle of radius r
 */
function calculateCornerArea(r: number, height: number): number {
  if (height >= r) {
    // Full quarter circle
    return (Math.PI * r * r) / 4;
  }

  // Partial circle segment
  // Area under circular arc from 0 to height
  // x = sqrt(r² - (r-y)²) for the curved part
  const h = height;
  const theta = Math.acos((r - h) / r);
  const segmentArea = r * r * (theta - Math.sin(theta) * Math.cos(theta)) / 2;
  return segmentArea;
}

/**
 * Calculate displaced water volume at a given waterline height (in mm³)
 */
export function calculateDisplacedVolume(
  params: BoatParams,
  totalLength: number,
  waterlineHeight: number
): number {
  if (waterlineHeight <= 0) return 0;

  const { beam, bilgeRadius, bowLengthPercent } = params;
  const bowLength = totalLength * (bowLengthPercent / 100);
  const sternLength = totalLength - bowLength;

  // Stern section: constant cross-section
  const sternArea = calculateCrossSectionArea(beam, bilgeRadius, waterlineHeight);
  const sternVolume = sternArea * sternLength;

  // Bow section: tapered (integrate along length)
  let bowVolume = 0;
  const bowSegments = 20;

  for (let i = 0; i < bowSegments; i++) {
    const t1 = i / bowSegments;
    const t2 = (i + 1) / bowSegments;

    // Linear taper from full beam to ~3% at tip
    const scale1 = 1 - t1 * 0.97;
    const scale2 = 1 - t2 * 0.97;
    const avgScale = (scale1 + scale2) / 2;

    const segmentLength = bowLength / bowSegments;
    const segmentBeam = beam * avgScale;
    const segmentBilge = bilgeRadius * avgScale;
    const segmentArea = calculateCrossSectionArea(segmentBeam, segmentBilge, waterlineHeight);

    bowVolume += segmentArea * segmentLength;
  }

  return sternVolume + bowVolume;
}

/**
 * Calculate the volume of PLA material in the hull shell (in mm³)
 */
export function calculatePLAVolume(
  params: BoatParams,
  totalLength: number
): number {
  const { beam, hullHeight, bilgeRadius, wallThickness, bowLengthPercent } = params;
  const bowLength = totalLength * (bowLengthPercent / 100);
  const sternLength = totalLength - bowLength;

  // Outer volume
  const outerArea = calculateCrossSectionArea(beam, bilgeRadius, hullHeight);

  // Inner volume (open top, so only subtract from bottom)
  const innerBeam = beam - 2 * wallThickness;
  const innerBilge = Math.max(0, bilgeRadius - wallThickness);
  const innerHeight = hullHeight - wallThickness; // Bottom wall
  const innerArea = innerBeam > 0 ? calculateCrossSectionArea(innerBeam, innerBilge, innerHeight) : 0;

  const sternShellArea = outerArea - innerArea;

  // Stern section shell volume
  let sternVolume = sternShellArea * sternLength;

  // Add stern end cap (back wall)
  sternVolume += outerArea * wallThickness;

  // Bow section (tapered shell)
  let bowVolume = 0;
  const bowSegments = 20;

  for (let i = 0; i < bowSegments; i++) {
    const t1 = i / bowSegments;
    const t2 = (i + 1) / bowSegments;
    const scale1 = 1 - t1 * 0.97;
    const scale2 = 1 - t2 * 0.97;
    const avgScale = (scale1 + scale2) / 2;

    const segmentLength = bowLength / bowSegments;

    const segOuterArea = calculateCrossSectionArea(
      beam * avgScale,
      bilgeRadius * avgScale,
      hullHeight
    );

    const scaledInnerBeam = innerBeam * avgScale;
    const scaledInnerBilge = innerBilge * avgScale;
    const scaledWall = wallThickness * Math.max(0.5, avgScale);
    const segInnerArea = scaledInnerBeam > 0
      ? calculateCrossSectionArea(scaledInnerBeam, scaledInnerBilge, hullHeight - scaledWall)
      : 0;

    const segShellArea = segOuterArea - segInnerArea;
    bowVolume += segShellArea * segmentLength;
  }

  return sternVolume + bowVolume;
}

/**
 * Calculate the mass of the PLA hull (in grams)
 */
export function calculatePLAMass(
  params: BoatParams,
  totalLength: number
): number {
  const volumeMm3 = calculatePLAVolume(params, totalLength);
  const volumeCm3 = volumeMm3 / 1000; // mm³ to cm³
  return volumeCm3 * PLA_DENSITY;
}

/**
 * Calculate total boat mass including payload (in grams)
 */
export function calculateTotalMass(
  params: BoatParams,
  totalLength: number
): number {
  const hullMass = calculatePLAMass(params, totalLength);
  const { motorWeight, batteryWeight, ballastWeight } = params;
  return hullMass + motorWeight + batteryWeight + ballastWeight;
}

/**
 * Calculate waterline height using bisection method
 * Returns the height in mm where the boat floats
 */
export function calculateWaterlineHeight(
  params: BoatParams,
  totalLength: number
): number {
  const totalMass = calculateTotalMass(params, totalLength);

  // Water density: 1 g/cm³ = 0.001 g/mm³
  const waterDensityGPerMm3 = 0.001;

  // Mass of water displaced must equal boat mass
  // massWater = volume * density
  // volume = mass / density

  const requiredVolume = totalMass / waterDensityGPerMm3; // in mm³

  // Binary search for waterline height
  let low = 0;
  let high = params.hullHeight;
  const tolerance = 0.1; // mm

  for (let iter = 0; iter < 50; iter++) {
    const mid = (low + high) / 2;
    const volume = calculateDisplacedVolume(params, totalLength, mid);

    if (Math.abs(volume - requiredVolume) < requiredVolume * 0.001) {
      return mid;
    }

    if (volume < requiredVolume) {
      low = mid;
    } else {
      high = mid;
    }

    if (high - low < tolerance) {
      return mid;
    }
  }

  return (low + high) / 2;
}

/**
 * Check if boat would sink (waterline above hull height)
 */
export function wouldSink(
  params: BoatParams,
  totalLength: number
): boolean {
  const waterline = calculateWaterlineHeight(params, totalLength);
  return waterline >= params.hullHeight * 0.95; // 95% submerged = practically sinking
}
