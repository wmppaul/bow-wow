import { useMemo } from 'react';
import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';
import { computeXCrossSection, computeYCrossSection, computeZCrossSection } from '../utils/crossSection';

interface HullMeshProps {
  params: BoatParams;
  calculatedLength: number;
  clippingPlanes?: THREE.Plane[];
  showCaps?: boolean;
}

// Component for rendering a computed cross-section cap
function ComputedCrossSection({
  params,
  calculatedLength,
  plane,
}: {
  params: BoatParams;
  calculatedLength: number;
  plane: THREE.Plane;
}) {
  // Determine which axis this plane cuts and compute geometry directly
  const capGeometry = useMemo(() => {
    const normal = plane.normal;
    const position = plane.constant;

    // Determine dominant axis from plane normal
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    if (absY >= absX && absY >= absZ) {
      // Y plane (horizontal cut)
      return computeYCrossSection(params, position, calculatedLength);
    } else if (absX >= absZ) {
      // X plane (vertical cut through beam)
      return computeXCrossSection(params, position, calculatedLength);
    } else {
      // Z plane (vertical cut along length)
      return computeZCrossSection(params, position, calculatedLength);
    }
  }, [params, calculatedLength, plane]);

  if (!capGeometry) return null;

  return (
    <mesh geometry={capGeometry}>
      <meshStandardMaterial
        color="#d06020"
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Number of segments for bilge curves (same as stern cap)
const BILGE_SEGMENTS = 8;

/**
 * Cross-section point layout (looking from bow toward stern):
 *
 * Outer points:
 *   topLeft -------- topRight
 *      |                |
 *   (bilge curve)    (bilge curve)
 *       \              /
 *        \------------/
 *         bottomCenter
 *
 * Point indices:
 * - 0: bottom center
 * - 1 to BILGE_SEGMENTS: left bilge curve
 * - BILGE_SEGMENTS+1: top-left
 * - BILGE_SEGMENTS+2: top-right
 * - BILGE_SEGMENTS+3 to 2*BILGE_SEGMENTS+2: right bilge curve
 * - 2*BILGE_SEGMENTS+3: bottom center (closing point)
 *
 * Inner points follow same layout, offset by OUTER_POINTS
 */
const OUTER_POINTS = 2 * BILGE_SEGMENTS + 4;
const POINTS_PER_SECTION = OUTER_POINTS * 2; // outer + inner

// Named indices for clarity
const IDX = {
  bottomCenter: 0,
  leftBilgeStart: 1,
  leftBilgeEnd: BILGE_SEGMENTS,
  topLeft: BILGE_SEGMENTS + 1,
  topRight: BILGE_SEGMENTS + 2,
  rightBilgeStart: BILGE_SEGMENTS + 3,
  rightBilgeEnd: 2 * BILGE_SEGMENTS + 2,
  bottomCenterClose: 2 * BILGE_SEGMENTS + 3,
  // Inner points are offset by OUTER_POINTS
  innerOffset: OUTER_POINTS,
};

function createHullGeometry(
  params: BoatParams,
  sternLength: number,
  bowLength: number
): THREE.BufferGeometry {
  const { beam, hullHeight, bilgeRadius, wallThickness, bowType, bowRakeAngle, bowEntryAngle } = params;

  const vertices: number[] = [];
  const indices: number[] = [];

  // Convert angles to radians
  const rakeRad = (bowRakeAngle * Math.PI) / 180;
  // Deep V: entry angle controls how aggressively bilge flattens (higher = sharper V)
  const deepVSharpness = bowEntryAngle / 45; // Normalize to 0-1 range (45° is max)

  // Generate cross-section at a given z position with a scale factor
  // beamOverride allows specifying a different beam width (for stern curve)
  const addCrossSection = (z: number, scale: number, bowProgress: number = 0, isBowTip: boolean = false, beamOverride?: number) => {
    const effectiveBeam = beamOverride !== undefined ? beamOverride : beam;
    const halfBeam = (effectiveBeam / 2) * scale;

    // For Deep V: reduce bilge radius toward bow to create sharper V entry
    let effectiveBilgeRadius = bilgeRadius;
    if (bowType === 'deepV' && bowProgress > 0) {
      const reductionFactor = 0.5 + deepVSharpness * 0.45;
      effectiveBilgeRadius = bilgeRadius * (1 - bowProgress * reductionFactor);
    }

    const r = Math.min(effectiveBilgeRadius * scale, halfBeam - 0.1, hullHeight - 0.1);
    const effectiveR = Math.max(0, r);

    const innerHalfBeam = Math.max(0.1, halfBeam - wallThickness);
    const innerR = Math.max(0, effectiveR - wallThickness);
    const innerBottom = wallThickness;

    // Calculate Z offset for raked bow
    const calcRakeOffset = (y: number) => {
      if (bowType !== 'raked' || bowProgress === 0) return 0;
      return y * Math.tan(rakeRad) * bowProgress;
    };

    if (isBowTip || halfBeam < 0.5 || scale < 0.02) {
      // Collapsed to center line for bow tip
      const tipZ = z + calcRakeOffset(hullHeight / 2);
      for (let i = 0; i < OUTER_POINTS; i++) vertices.push(0, 0, tipZ);
      for (let i = 0; i < OUTER_POINTS; i++) vertices.push(0, wallThickness, tipZ);
    } else {
      // Generate outer profile points
      const z0 = z + calcRakeOffset(0);
      const zTop = z + calcRakeOffset(hullHeight);

      // 0: bottom center
      vertices.push(0, 0, z0);

      // 1 to BILGE_SEGMENTS: left bilge curve
      for (let i = 0; i < BILGE_SEGMENTS; i++) {
        const angle = (Math.PI / 2) * (i / (BILGE_SEGMENTS - 1));
        const x = -(halfBeam - effectiveR) - Math.sin(angle) * effectiveR;
        const y = effectiveR - Math.cos(angle) * effectiveR;
        const zPt = z + calcRakeOffset(y);
        vertices.push(x, y, zPt);
      }

      // BILGE_SEGMENTS+1: top-left
      vertices.push(-halfBeam, hullHeight, zTop);

      // BILGE_SEGMENTS+2: top-right
      vertices.push(halfBeam, hullHeight, zTop);

      // BILGE_SEGMENTS+3 to 2*BILGE_SEGMENTS+2: right bilge curve
      for (let i = 0; i < BILGE_SEGMENTS; i++) {
        const angle = (Math.PI / 2) * (1 - i / (BILGE_SEGMENTS - 1));
        const x = (halfBeam - effectiveR) + Math.sin(angle) * effectiveR;
        const y = effectiveR - Math.cos(angle) * effectiveR;
        const zPt = z + calcRakeOffset(y);
        vertices.push(x, y, zPt);
      }

      // 2*BILGE_SEGMENTS+3: bottom center (closing point)
      vertices.push(0, 0, z0);

      // Generate inner profile points (same structure, inset)
      const iz0 = z + calcRakeOffset(innerBottom);
      const izTop = z + calcRakeOffset(hullHeight);

      // Inner bottom center
      vertices.push(0, innerBottom, iz0);

      // Inner left bilge curve
      for (let i = 0; i < BILGE_SEGMENTS; i++) {
        const angle = (Math.PI / 2) * (i / (BILGE_SEGMENTS - 1));
        const x = -(innerHalfBeam - innerR) - Math.sin(angle) * innerR;
        const y = innerBottom + innerR - Math.cos(angle) * innerR;
        const zPt = z + calcRakeOffset(y);
        vertices.push(x, y, zPt);
      }

      // Inner top-left
      vertices.push(-innerHalfBeam, hullHeight, izTop);

      // Inner top-right
      vertices.push(innerHalfBeam, hullHeight, izTop);

      // Inner right bilge curve
      for (let i = 0; i < BILGE_SEGMENTS; i++) {
        const angle = (Math.PI / 2) * (1 - i / (BILGE_SEGMENTS - 1));
        const x = (innerHalfBeam - innerR) + Math.sin(angle) * innerR;
        const y = innerBottom + innerR - Math.cos(angle) * innerR;
        const zPt = z + calcRakeOffset(y);
        vertices.push(x, y, zPt);
      }

      // Inner bottom center (closing point)
      vertices.push(0, innerBottom, iz0);
    }
  };

  // Generate all cross-sections from stern to bow tip
  // Stern is FLAT - no taper, just a straight back with a transom closure
  const sternSections = 3;  // Straight stern sections
  const bowSections = 20;

  // Center offset: shift geometry so hull center is at z=0
  const hullCenterZ = (bowLength - sternLength) / 2;

  // Stern sections (constant cross-section, from -sternLength to 0)
  for (let i = 0; i <= sternSections; i++) {
    const t = i / sternSections;
    const z = -sternLength + t * sternLength - hullCenterZ;
    addCrossSection(z, 1.0, 0, false);
  }

  // Bow section (tapered)
  for (let i = 1; i <= bowSections; i++) {
    const t = i / bowSections;
    const z = t * bowLength - hullCenterZ;
    const scale = Math.max(0, 1 - t);
    const isBowTip = (i === bowSections);
    addCrossSection(z, scale, t, isBowTip);
  }

  // Total sections: stern (sternSections + 1) + bow
  const numSections = (sternSections + 1) + bowSections;

  // Helper to create faces between adjacent section points
  const addQuad = (curr: number, next: number, p1: number, p2: number, flip: boolean = false) => {
    if (flip) {
      indices.push(curr + p1, next + p2, curr + p2);
      indices.push(curr + p1, next + p1, next + p2);
    } else {
      indices.push(curr + p1, curr + p2, next + p2);
      indices.push(curr + p1, next + p2, next + p1);
    }
  };

  // Create faces between adjacent sections
  for (let sec = 0; sec < numSections - 1; sec++) {
    const curr = sec * POINTS_PER_SECTION;
    const next = (sec + 1) * POINTS_PER_SECTION;

    // Outer hull faces
    // Bottom to first bilge point (flip=true for correct downward-facing normal)
    addQuad(curr, next, IDX.bottomCenter, IDX.leftBilgeStart, true);

    // Left bilge curve
    for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
      addQuad(curr, next, IDX.leftBilgeStart + i, IDX.leftBilgeStart + i + 1);
    }

    // Left bilge end to top-left
    addQuad(curr, next, IDX.leftBilgeEnd, IDX.topLeft);

    // Top is open (no faces between topLeft and topRight)

    // Top-right to right bilge start
    addQuad(curr, next, IDX.topRight, IDX.rightBilgeStart);

    // Right bilge curve
    for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
      addQuad(curr, next, IDX.rightBilgeStart + i, IDX.rightBilgeStart + i + 1);
    }

    // Right bilge end to bottom center close (flip=true for correct downward-facing normal)
    addQuad(curr, next, IDX.rightBilgeEnd, IDX.bottomCenterClose, true);

    // Inner hull faces (reversed winding)
    const io = IDX.innerOffset;

    // Inner bottom to first bilge point
    addQuad(curr, next, io + IDX.bottomCenter, io + IDX.leftBilgeStart, true);

    // Inner left bilge curve
    for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
      addQuad(curr, next, io + IDX.leftBilgeStart + i, io + IDX.leftBilgeStart + i + 1, true);
    }

    // Inner left bilge end to top-left
    addQuad(curr, next, io + IDX.leftBilgeEnd, io + IDX.topLeft, true);

    // Inner top-right to right bilge start
    addQuad(curr, next, io + IDX.topRight, io + IDX.rightBilgeStart, true);

    // Inner right bilge curve
    for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
      addQuad(curr, next, io + IDX.rightBilgeStart + i, io + IDX.rightBilgeStart + i + 1, true);
    }

    // Inner right bilge end to bottom center close
    addQuad(curr, next, io + IDX.rightBilgeEnd, io + IDX.bottomCenterClose, true);

    // Top rim (connect outer top to inner top)
    // Left rim
    indices.push(curr + IDX.topLeft, curr + io + IDX.topLeft, next + io + IDX.topLeft);
    indices.push(curr + IDX.topLeft, next + io + IDX.topLeft, next + IDX.topLeft);

    // Right rim
    indices.push(curr + IDX.topRight, next + io + IDX.topRight, curr + io + IDX.topRight);
    indices.push(curr + IDX.topRight, next + IDX.topRight, next + io + IDX.topRight);

  }

  // Stern closure - flat transom with wall thickness
  // The stern wall has thickness in the Z direction:
  // - Outer transom face at sternZ (section 0's outer points)
  // - Inner transom face at sternZ + wallThickness (new offset vertices)
  // - Rim connects outer to inner around the perimeter

  const sternSection = 0;
  const sternOuterBase = sternSection; // Outer points of section 0
  const sternZ = -sternLength - hullCenterZ; // Z position of outer stern
  const innerSternZ = sternZ + wallThickness; // Z position of inner stern

  // Create new vertices for the inner stern face (offset forward by wallThickness)
  const innerSternBase = vertices.length / 3; // Starting index for new inner stern vertices

  // Copy the inner profile from section 0, but offset Z by wallThickness
  const halfBeam_stern = beam / 2;
  const innerHalfBeam_stern = Math.max(0.1, halfBeam_stern - wallThickness);
  const r_stern = Math.min(bilgeRadius, halfBeam_stern - 0.1, hullHeight - 0.1);
  const effectiveR_stern = Math.max(0, r_stern);
  const innerR_stern = Math.max(0, effectiveR_stern - wallThickness);
  const innerBottom_stern = wallThickness;

  // Inner bottom center
  vertices.push(0, innerBottom_stern, innerSternZ);

  // Inner left bilge curve
  for (let i = 0; i < BILGE_SEGMENTS; i++) {
    const angle = (Math.PI / 2) * (i / (BILGE_SEGMENTS - 1));
    const x = -(innerHalfBeam_stern - innerR_stern) - Math.sin(angle) * innerR_stern;
    const y = innerBottom_stern + innerR_stern - Math.cos(angle) * innerR_stern;
    vertices.push(x, y, innerSternZ);
  }

  // Inner top-left
  vertices.push(-innerHalfBeam_stern, hullHeight, innerSternZ);

  // Inner top-right
  vertices.push(innerHalfBeam_stern, hullHeight, innerSternZ);

  // Inner right bilge curve
  for (let i = 0; i < BILGE_SEGMENTS; i++) {
    const angle = (Math.PI / 2) * (1 - i / (BILGE_SEGMENTS - 1));
    const x = (innerHalfBeam_stern - innerR_stern) + Math.sin(angle) * innerR_stern;
    const y = innerBottom_stern + innerR_stern - Math.cos(angle) * innerR_stern;
    vertices.push(x, y, innerSternZ);
  }

  // Inner bottom center (closing point)
  vertices.push(0, innerBottom_stern, innerSternZ);

  // === OUTER TRANSOM FACE ===
  // Triangulate the outer U-shape facing backward (-Z)
  // Uses section 0's outer points
  for (let i = IDX.leftBilgeStart; i < IDX.topLeft; i++) {
    indices.push(sternOuterBase + IDX.bottomCenter, sternOuterBase + i, sternOuterBase + i + 1);
  }
  indices.push(sternOuterBase + IDX.bottomCenter, sternOuterBase + IDX.topLeft, sternOuterBase + IDX.topRight);
  indices.push(sternOuterBase + IDX.bottomCenter, sternOuterBase + IDX.topRight, sternOuterBase + IDX.rightBilgeStart);
  for (let i = IDX.rightBilgeStart; i < IDX.bottomCenterClose; i++) {
    indices.push(sternOuterBase + IDX.bottomCenter, sternOuterBase + i, sternOuterBase + i + 1);
  }

  // === INNER TRANSOM FACE ===
  // Triangulate the inner U-shape facing forward (+Z) - uses new offset vertices
  for (let i = IDX.leftBilgeStart; i < IDX.topLeft; i++) {
    indices.push(innerSternBase + IDX.bottomCenter, innerSternBase + i + 1, innerSternBase + i);
  }
  indices.push(innerSternBase + IDX.bottomCenter, innerSternBase + IDX.topRight, innerSternBase + IDX.topLeft);
  indices.push(innerSternBase + IDX.bottomCenter, innerSternBase + IDX.rightBilgeStart, innerSternBase + IDX.topRight);
  for (let i = IDX.rightBilgeStart; i < IDX.bottomCenterClose; i++) {
    indices.push(innerSternBase + IDX.bottomCenter, innerSternBase + i + 1, innerSternBase + i);
  }

  // === STERN WALL RIM ===
  // Connect outer stern (at sternZ) to inner stern (at sternZ + wallThickness)
  // This creates the actual wall thickness visible from the side

  // Left wall (8 -> 9)
  indices.push(sternOuterBase + IDX.leftBilgeEnd, sternOuterBase + IDX.topLeft, innerSternBase + IDX.topLeft);
  indices.push(sternOuterBase + IDX.leftBilgeEnd, innerSternBase + IDX.topLeft, innerSternBase + IDX.leftBilgeEnd);

  // Left bilge curve
  for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
    const outerCurr = sternOuterBase + IDX.leftBilgeStart + i;
    const outerNext = sternOuterBase + IDX.leftBilgeStart + i + 1;
    const innerCurr = innerSternBase + IDX.leftBilgeStart + i;
    const innerNext = innerSternBase + IDX.leftBilgeStart + i + 1;
    indices.push(outerCurr, outerNext, innerNext);
    indices.push(outerCurr, innerNext, innerCurr);
  }

  // Bottom left (0 -> 1)
  indices.push(sternOuterBase + IDX.bottomCenter, sternOuterBase + IDX.leftBilgeStart, innerSternBase + IDX.leftBilgeStart);
  indices.push(sternOuterBase + IDX.bottomCenter, innerSternBase + IDX.leftBilgeStart, innerSternBase + IDX.bottomCenter);

  // Bottom right (18 -> 19)
  indices.push(sternOuterBase + IDX.rightBilgeEnd, sternOuterBase + IDX.bottomCenterClose, innerSternBase + IDX.bottomCenterClose);
  indices.push(sternOuterBase + IDX.rightBilgeEnd, innerSternBase + IDX.bottomCenterClose, innerSternBase + IDX.rightBilgeEnd);

  // Right bilge curve
  for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
    const outerCurr = sternOuterBase + IDX.rightBilgeStart + i;
    const outerNext = sternOuterBase + IDX.rightBilgeStart + i + 1;
    const innerCurr = innerSternBase + IDX.rightBilgeStart + i;
    const innerNext = innerSternBase + IDX.rightBilgeStart + i + 1;
    indices.push(outerCurr, innerCurr, innerNext);
    indices.push(outerCurr, innerNext, outerNext);
  }

  // Right wall (10 -> 11)
  indices.push(sternOuterBase + IDX.topRight, innerSternBase + IDX.topRight, innerSternBase + IDX.rightBilgeStart);
  indices.push(sternOuterBase + IDX.topRight, innerSternBase + IDX.rightBilgeStart, sternOuterBase + IDX.rightBilgeStart);

  // === CONNECT INNER STERN TO INNER HULL ===
  // Bridge from the offset inner stern vertices to section 0's inner points
  // This closes the gap where the inner hull surface meets the stern wall
  const section0Inner = sternSection + IDX.innerOffset;

  // Connect each inner stern point to its corresponding section 0 inner point
  // Left bilge
  for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
    const sternCurr = innerSternBase + IDX.leftBilgeStart + i;
    const sternNext = innerSternBase + IDX.leftBilgeStart + i + 1;
    const hullCurr = section0Inner + IDX.leftBilgeStart + i;
    const hullNext = section0Inner + IDX.leftBilgeStart + i + 1;
    indices.push(sternCurr, hullNext, sternNext);
    indices.push(sternCurr, hullCurr, hullNext);
  }

  // Left wall
  indices.push(innerSternBase + IDX.leftBilgeEnd, section0Inner + IDX.topLeft, innerSternBase + IDX.topLeft);
  indices.push(innerSternBase + IDX.leftBilgeEnd, section0Inner + IDX.leftBilgeEnd, section0Inner + IDX.topLeft);

  // Bottom left
  indices.push(innerSternBase + IDX.bottomCenter, section0Inner + IDX.leftBilgeStart, innerSternBase + IDX.leftBilgeStart);
  indices.push(innerSternBase + IDX.bottomCenter, section0Inner + IDX.bottomCenter, section0Inner + IDX.leftBilgeStart);

  // Bottom right
  indices.push(innerSternBase + IDX.rightBilgeEnd, section0Inner + IDX.bottomCenterClose, innerSternBase + IDX.bottomCenterClose);
  indices.push(innerSternBase + IDX.rightBilgeEnd, section0Inner + IDX.rightBilgeEnd, section0Inner + IDX.bottomCenterClose);

  // Right bilge
  for (let i = 0; i < BILGE_SEGMENTS - 1; i++) {
    const sternCurr = innerSternBase + IDX.rightBilgeStart + i;
    const sternNext = innerSternBase + IDX.rightBilgeStart + i + 1;
    const hullCurr = section0Inner + IDX.rightBilgeStart + i;
    const hullNext = section0Inner + IDX.rightBilgeStart + i + 1;
    indices.push(sternCurr, sternNext, hullNext);
    indices.push(sternCurr, hullNext, hullCurr);
  }

  // Right wall
  indices.push(innerSternBase + IDX.topRight, innerSternBase + IDX.rightBilgeStart, section0Inner + IDX.rightBilgeStart);
  indices.push(innerSternBase + IDX.topRight, section0Inner + IDX.rightBilgeStart, section0Inner + IDX.topRight);

  // Bow tip closure
  const lastFullSection = (numSections - 2) * POINTS_PER_SECTION;
  const tipSection = (numSections - 1) * POINTS_PER_SECTION;

  // Close outer surface at bow - triangles converging to tip point
  for (let i = IDX.bottomCenter; i < IDX.bottomCenterClose; i++) {
    indices.push(lastFullSection + i, lastFullSection + i + 1, tipSection + 0);
  }

  // Close inner surface at bow (reversed winding)
  const io = IDX.innerOffset;
  for (let i = IDX.bottomCenter; i < IDX.bottomCenterClose; i++) {
    indices.push(lastFullSection + io + i, tipSection + io, lastFullSection + io + i + 1);
  }

  // Close wall thickness at bow tip
  // Connect each outer point to its inner counterpart via the tip
  for (let i = IDX.bottomCenter; i <= IDX.bottomCenterClose; i++) {
    const nextI = (i === IDX.bottomCenterClose) ? IDX.bottomCenter : i + 1;

    // Skip the top gap (between topLeft and topRight)
    if (i === IDX.topLeft) {
      // Connect outer topLeft to inner topLeft via tips
      indices.push(lastFullSection + IDX.topLeft, lastFullSection + io + IDX.topLeft, tipSection + io);
      indices.push(lastFullSection + IDX.topLeft, tipSection + io, tipSection + 0);
      continue;
    }
    if (i === IDX.topRight) {
      // Connect outer topRight to inner topRight via tips
      indices.push(lastFullSection + IDX.topRight, tipSection + 0, tipSection + io);
      indices.push(lastFullSection + IDX.topRight, tipSection + io, lastFullSection + io + IDX.topRight);
      // Also create wall from topRight to rightBilgeStart (don't skip it!)
      indices.push(lastFullSection + IDX.rightBilgeStart, lastFullSection + IDX.topRight, lastFullSection + io + IDX.topRight);
      indices.push(lastFullSection + IDX.rightBilgeStart, lastFullSection + io + IDX.topRight, lastFullSection + io + IDX.rightBilgeStart);
      continue;
    }

    // Regular wall closure between adjacent points
    indices.push(lastFullSection + nextI, lastFullSection + i, lastFullSection + io + i);
    indices.push(lastFullSection + nextI, lastFullSection + io + i, lastFullSection + io + nextI);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Create motor mount geometry
 */
function createMotorMountGeometry(params: BoatParams, sternLength: number, bowLength: number): THREE.BufferGeometry {
  const {
    motorMountDiameter,
    motorMountOffset,
    motorMountNeckWidth,
    motorMountLength,
    motorMountFromStern,
  } = params;

  const cylinderRadius = motorMountDiameter / 2;

  // Calculate stern position (same centering as hull geometry)
  const hullCenterZ = (bowLength - sternLength) / 2;
  const sternZ = -sternLength - hullCenterZ;

  // Motor mount center Z position: from the back of stern, forward by motorMountFromStern
  const mountCenterZ = sternZ + motorMountFromStern;

  // Cylinder - aligned along Z axis (boat length)
  const cylinder = new THREE.CylinderGeometry(
    cylinderRadius,
    cylinderRadius,
    motorMountLength,
    16
  );
  // CylinderGeometry is vertical (along Y), rotate to align with Z (boat length)
  cylinder.rotateX(Math.PI / 2);
  // Position: below hull (Y negative), at calculated position
  cylinder.translate(
    0,
    -motorMountOffset - cylinderRadius,
    mountCenterZ
  );

  // Neck connecting to hull
  const neckHeight = motorMountOffset + cylinderRadius;
  const neck = new THREE.BoxGeometry(
    motorMountNeckWidth,
    neckHeight,
    motorMountLength
  );
  neck.translate(
    0,
    -neckHeight / 2,
    mountCenterZ
  );

  // Merge them
  const cylPos = cylinder.getAttribute('position');
  const cylNorm = cylinder.getAttribute('normal');
  const cylIdx = cylinder.getIndex();
  const neckPos = neck.getAttribute('position');
  const neckNorm = neck.getAttribute('normal');
  const neckIdx = neck.getIndex();

  const totalVerts = cylPos.count + neckPos.count;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);

  positions.set(cylPos.array as Float32Array, 0);
  positions.set(neckPos.array as Float32Array, cylPos.count * 3);
  normals.set(cylNorm.array as Float32Array, 0);
  normals.set(neckNorm.array as Float32Array, cylNorm.count * 3);

  const indices: number[] = [];
  if (cylIdx) {
    for (let i = 0; i < cylIdx.count; i++) {
      indices.push(cylIdx.array[i]);
    }
  }
  if (neckIdx) {
    for (let i = 0; i < neckIdx.count; i++) {
      indices.push(neckIdx.array[i] + cylPos.count);
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(indices);

  return merged;
}

export function HullMesh({ params, calculatedLength, clippingPlanes, showCaps = true }: HullMeshProps) {
  const { hullGeometry, motorMountGeometry } = useMemo(() => {
    const bowLength = calculatedLength * (params.bowLengthPercent / 100);
    const sternLength = calculatedLength - bowLength;

    return {
      hullGeometry: createHullGeometry(params, sternLength, bowLength),
      motorMountGeometry: createMotorMountGeometry(params, sternLength, bowLength),
    };
  }, [params, calculatedLength]);

  // Use empty array when no clipping to properly clear previous planes
  const activePlanes = clippingPlanes && clippingPlanes.length > 0 ? clippingPlanes : [];
  const hasClipping = activePlanes.length > 0;

  return (
    <group>
      {/* Complete hull (stern curve + straight stern + bow as one piece) */}
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          key={`hull-mat-${hasClipping}`}
          color="#e07030"
          side={THREE.DoubleSide}
          flatShading={false}
          clippingPlanes={activePlanes}
          clipShadows={hasClipping}
        />
      </mesh>

      {/* Motor mount */}
      <mesh geometry={motorMountGeometry} castShadow>
        <meshStandardMaterial
          key={`motor-mat-${hasClipping}`}
          color="#505050"
          clippingPlanes={activePlanes}
          clipShadows={hasClipping}
        />
      </mesh>

      {/* Computed cross-section caps */}
      {showCaps && activePlanes.map((plane, index) => (
        <ComputedCrossSection
          key={`cross-section-${index}`}
          params={params}
          calculatedLength={calculatedLength}
          plane={plane}
        />
      ))}
    </group>
  );
}
