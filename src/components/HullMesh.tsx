import { useMemo } from 'react';
import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';

interface HullMeshProps {
  params: BoatParams;
  calculatedLength: number;
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
  const addCrossSection = (z: number, scale: number, bowProgress: number = 0, isBowTip: boolean = false) => {
    const halfBeam = (beam / 2) * scale;

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
  const sternSections = 2;
  const bowSections = 20;

  // Center offset: shift geometry so hull center is at z=0
  const hullCenterZ = (bowLength - sternLength) / 2;

  // Stern section (constant cross-section)
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

  const numSections = sternSections + 1 + bowSections;

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
 * Create stern transom - a solid wall that seals the entire back of the boat
 * Has wall thickness to match the hull
 */
function createSternCapGeometry(params: BoatParams, sternLength: number, bowLength: number): THREE.BufferGeometry {
  const { beam, hullHeight, bilgeRadius, wallThickness } = params;

  // Center offset to match hull centering
  const hullCenterZ = (bowLength - sternLength) / 2;

  // Calculate dimensions
  const halfBeam = beam / 2;
  const r = Math.min(bilgeRadius, halfBeam - 0.1, hullHeight - 0.1);
  const effectiveR = Math.max(0, r);

  // Create the U-shaped profile using THREE.Shape
  const shape = new THREE.Shape();

  // Start at bottom center
  shape.moveTo(0, 0);

  // Left side - bottom to bilge curve
  shape.lineTo(-(halfBeam - effectiveR), 0);

  // Left bilge curve (quarter circle from bottom to side)
  if (effectiveR > 0) {
    for (let i = 1; i <= BILGE_SEGMENTS; i++) {
      const angle = (Math.PI / 2) * (i / BILGE_SEGMENTS);
      const x = -(halfBeam - effectiveR) - Math.sin(angle) * effectiveR;
      const y = effectiveR - Math.cos(angle) * effectiveR;
      shape.lineTo(x, y);
    }
  } else {
    shape.lineTo(-halfBeam, 0);
  }

  // Left wall up to top
  shape.lineTo(-halfBeam, hullHeight);

  // Top - left to right
  shape.lineTo(halfBeam, hullHeight);

  // Right wall down to bilge
  if (effectiveR > 0) {
    shape.lineTo(halfBeam, effectiveR);
  }

  // Right bilge curve (quarter circle from side to bottom)
  if (effectiveR > 0) {
    for (let i = 1; i <= BILGE_SEGMENTS; i++) {
      const angle = (Math.PI / 2) * (i / BILGE_SEGMENTS);
      const x = (halfBeam - effectiveR) + Math.cos(angle) * effectiveR;
      const y = effectiveR - Math.sin(angle) * effectiveR;
      shape.lineTo(x, y);
    }
  } else {
    shape.lineTo(halfBeam, 0);
  }

  // Close back to center
  shape.lineTo(0, 0);

  // Extrude the shape to give it wall thickness
  const extrudeSettings = {
    depth: wallThickness,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Position: the extrusion goes in +Z direction from the XY plane
  // We want the back face at the centered stern position
  geometry.translate(0, 0, -sternLength - hullCenterZ);

  return geometry;
}

/**
 * Create motor mount geometry
 */
function createMotorMountGeometry(params: BoatParams): THREE.BufferGeometry {
  const {
    motorMountDiameter,
    motorMountOffset,
    motorMountNeckWidth,
    motorMountLength,
    motorMountFromStern,
  } = params;

  const cylinderRadius = motorMountDiameter / 2;

  // Cylinder - aligned along Z axis (boat length)
  const cylinder = new THREE.CylinderGeometry(
    cylinderRadius,
    cylinderRadius,
    motorMountLength,
    16
  );
  // CylinderGeometry is vertical (along Y), rotate to align with Z (boat length)
  cylinder.rotateX(Math.PI / 2);
  // Position: below hull (Y negative), at stern area (Z negative)
  cylinder.translate(
    0,
    -motorMountOffset - cylinderRadius,
    -motorMountFromStern + motorMountLength / 2
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
    -motorMountFromStern + motorMountLength / 2
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

export function HullMesh({ params, calculatedLength }: HullMeshProps) {
  const { hullGeometry, sternCapGeometry, motorMountGeometry } = useMemo(() => {
    const bowLength = calculatedLength * (params.bowLengthPercent / 100);
    const sternLength = calculatedLength - bowLength;

    return {
      hullGeometry: createHullGeometry(params, sternLength, bowLength),
      sternCapGeometry: createSternCapGeometry(params, sternLength, bowLength),
      motorMountGeometry: createMotorMountGeometry(params),
    };
  }, [params, calculatedLength]);

  return (
    <group>
      {/* Complete hull (stern + bow as one piece) */}
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#e07030"
          side={THREE.DoubleSide}
          flatShading={false}
        />
      </mesh>

      {/* Stern transom */}
      <mesh geometry={sternCapGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#e07030"
          side={THREE.DoubleSide}
          flatShading={false}
        />
      </mesh>

      {/* Motor mount */}
      <mesh geometry={motorMountGeometry} castShadow>
        <meshStandardMaterial color="#505050" />
      </mesh>
    </group>
  );
}
