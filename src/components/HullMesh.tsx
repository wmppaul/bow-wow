import { useMemo } from 'react';
import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';

interface HullMeshProps {
  params: BoatParams;
  calculatedLength: number;
}

/**
 * Cross-section point layout (looking from bow toward stern):
 *
 * Outer points (0-7):
 *   3 -------- 4
 *   |          |
 *   2          5
 *    \        /
 *     1------6
 *        0
 *
 * Inner points (8-15) - same layout but inset by wall thickness
 *
 * Point 0 is bottom center, going counter-clockwise
 */
const POINTS_PER_SECTION = 16; // 8 outer + 8 inner

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
  // bowProgress: 0 = start of bow (z=0), 1 = tip of bow
  // isBowTip: if true, collapse all points to center line for proper bow closure
  const addCrossSection = (z: number, scale: number, bowProgress: number = 0, isBowTip: boolean = false) => {
    const halfBeam = (beam / 2) * scale;

    // For Deep V: reduce bilge radius toward bow to create sharper V entry
    let effectiveBilgeRadius = bilgeRadius;
    if (bowType === 'deepV' && bowProgress > 0) {
      // Reduce bilge radius based on entry angle - higher angle = faster reduction
      // At 45° (max), bilge goes to near zero quickly; at 10° (min), gradual reduction
      const reductionFactor = 0.5 + deepVSharpness * 0.45; // Range: 0.5 to 0.95
      effectiveBilgeRadius = bilgeRadius * (1 - bowProgress * reductionFactor);
    }

    const r = Math.min(effectiveBilgeRadius * scale, halfBeam - 0.1, hullHeight - 0.1);
    const effectiveR = Math.max(0, r);

    const innerHalfBeam = Math.max(0.1, halfBeam - wallThickness);
    const innerR = Math.max(0, effectiveR - wallThickness);
    const innerBottom = wallThickness;

    // Calculate Z offset for raked bow - higher points lean forward
    const calcRakeOffset = (y: number) => {
      if (bowType !== 'raked' || bowProgress === 0) return 0;
      // Rake offset increases with height and bow progress
      // At full rake, top of hull leans forward by tan(rakeAngle) * hullHeight
      return y * Math.tan(rakeRad) * bowProgress;
    };

    if (isBowTip || halfBeam < 0.5 || scale < 0.02) {
      // Collapsed to center line - all outer points at bottom center, inner at inner bottom
      // This creates a proper pointed bow
      const tipZ = z + calcRakeOffset(hullHeight / 2); // Use mid-height for tip Z
      for (let i = 0; i < 8; i++) vertices.push(0, 0, tipZ);
      for (let i = 0; i < 8; i++) vertices.push(0, wallThickness, tipZ);
    } else {
      // Outer profile (8 points) - counter-clockwise from bottom center
      const z0 = z + calcRakeOffset(0);
      const z2 = z + calcRakeOffset(effectiveR);
      const z3 = z + calcRakeOffset(hullHeight);

      vertices.push(0, 0, z0);                                       // 0: bottom center
      vertices.push(-(halfBeam - effectiveR), 0, z0);                // 1: bottom-left before bilge
      vertices.push(-halfBeam, effectiveR, z2);                      // 2: left at bilge top
      vertices.push(-halfBeam, hullHeight, z3);                      // 3: top-left
      vertices.push(halfBeam, hullHeight, z3);                       // 4: top-right
      vertices.push(halfBeam, effectiveR, z2);                       // 5: right at bilge top
      vertices.push((halfBeam - effectiveR), 0, z0);                 // 6: bottom-right before bilge
      vertices.push(0, 0, z0);                                       // 7: back to bottom center (for closing)

      // Inner profile (8 points) - same layout, inset
      const innerBilgeY = innerBottom + innerR;
      const iz0 = z + calcRakeOffset(innerBottom);
      const iz2 = z + calcRakeOffset(innerBilgeY);
      const iz3 = z + calcRakeOffset(hullHeight);

      vertices.push(0, innerBottom, iz0);                                              // 8: inner bottom center
      vertices.push(-(innerHalfBeam - innerR), innerBottom, iz0);                      // 9: inner bottom-left
      vertices.push(-innerHalfBeam, innerBilgeY, iz2);                                 // 10: inner left bilge
      vertices.push(-innerHalfBeam, hullHeight, iz3);                                  // 11: inner top-left
      vertices.push(innerHalfBeam, hullHeight, iz3);                                   // 12: inner top-right
      vertices.push(innerHalfBeam, innerBilgeY, iz2);                                  // 13: inner right bilge
      vertices.push((innerHalfBeam - innerR), innerBottom, iz0);                       // 14: inner bottom-right
      vertices.push(0, innerBottom, iz0);                                              // 15: back to inner bottom center
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
    const z = -sternLength + t * sternLength - hullCenterZ; // Centered
    addCrossSection(z, 1.0, 0, false); // bowProgress = 0 for stern
  }

  // Bow section (tapered)
  for (let i = 1; i <= bowSections; i++) {
    const t = i / bowSections;
    const z = t * bowLength - hullCenterZ; // Centered
    // Use smooth taper that goes to near-zero
    const scale = Math.max(0, 1 - t);
    // Mark the very last section as bow tip to ensure it closes properly
    const isBowTip = (i === bowSections);
    // Pass bow progress for bow type variations (raked, deep V)
    addCrossSection(z, scale, t, isBowTip);
  }

  const numSections = sternSections + 1 + bowSections;

  // Create faces between adjacent sections
  for (let sec = 0; sec < numSections - 1; sec++) {
    const curr = sec * POINTS_PER_SECTION;
    const next = (sec + 1) * POINTS_PER_SECTION;

    // Outer hull faces (points 0-6, wrapping)
    // Bottom left: 0 -> 1
    indices.push(curr + 0, curr + 1, next + 1);
    indices.push(curr + 0, next + 1, next + 0);

    // Left bilge: 1 -> 2
    indices.push(curr + 1, curr + 2, next + 2);
    indices.push(curr + 1, next + 2, next + 1);

    // Left wall: 2 -> 3
    indices.push(curr + 2, curr + 3, next + 3);
    indices.push(curr + 2, next + 3, next + 2);

    // Top: 3 -> 4 (this is the open top, skip for open hull)
    // Actually we need this for the deck edge connection - skip

    // Right wall: 4 -> 5
    indices.push(curr + 4, curr + 5, next + 5);
    indices.push(curr + 4, next + 5, next + 4);

    // Right bilge: 5 -> 6
    indices.push(curr + 5, curr + 6, next + 6);
    indices.push(curr + 5, next + 6, next + 5);

    // Bottom right: 6 -> 0 (close the bottom)
    indices.push(curr + 6, curr + 0, next + 0);
    indices.push(curr + 6, next + 0, next + 6);

    // Inner hull faces (points 8-14, reversed winding for inward normals)
    // Inner bottom left: 8 -> 9
    indices.push(curr + 8, next + 9, curr + 9);
    indices.push(curr + 8, next + 8, next + 9);

    // Inner left bilge: 9 -> 10
    indices.push(curr + 9, next + 10, curr + 10);
    indices.push(curr + 9, next + 9, next + 10);

    // Inner left wall: 10 -> 11
    indices.push(curr + 10, next + 11, curr + 11);
    indices.push(curr + 10, next + 10, next + 11);

    // Inner right wall: 12 -> 13
    indices.push(curr + 12, next + 13, curr + 13);
    indices.push(curr + 12, next + 12, next + 13);

    // Inner right bilge: 13 -> 14
    indices.push(curr + 13, next + 14, curr + 14);
    indices.push(curr + 13, next + 13, next + 14);

    // Inner bottom right: 14 -> 8
    indices.push(curr + 14, next + 8, curr + 8);
    indices.push(curr + 14, next + 14, next + 8);

    // Top rim (connect outer top to inner top)
    // Left rim: outer 3 to inner 11
    indices.push(curr + 3, curr + 11, next + 11);
    indices.push(curr + 3, next + 11, next + 3);

    // Right rim: outer 4 to inner 12
    indices.push(curr + 4, next + 12, curr + 12);
    indices.push(curr + 4, next + 4, next + 12);
  }

  // Stern end cap will be created as a separate geometry (see createSternCapGeometry)

  // Bow tip closure
  // The tip section has all points collapsed to a line from (0,0,z) to (0,wallThickness,z)
  // We need to close both surfaces and seal the wall thickness
  const lastFullSection = (numSections - 2) * POINTS_PER_SECTION;
  const tipSection = (numSections - 1) * POINTS_PER_SECTION;

  // Close outer surface at bow - triangles converging to outer tip point
  // Bottom-left side (points 0,1,2,3)
  indices.push(lastFullSection + 0, lastFullSection + 1, tipSection + 0);
  indices.push(lastFullSection + 1, lastFullSection + 2, tipSection + 0);
  indices.push(lastFullSection + 2, lastFullSection + 3, tipSection + 0);
  // Top-right side (points 3,4,5,6,0)
  indices.push(lastFullSection + 3, lastFullSection + 4, tipSection + 0);
  indices.push(lastFullSection + 4, lastFullSection + 5, tipSection + 0);
  indices.push(lastFullSection + 5, lastFullSection + 6, tipSection + 0);
  indices.push(lastFullSection + 6, lastFullSection + 0, tipSection + 0);

  // Close inner surface at bow - triangles converging to inner tip point (reversed winding)
  indices.push(lastFullSection + 8, tipSection + 8, lastFullSection + 9);
  indices.push(lastFullSection + 9, tipSection + 8, lastFullSection + 10);
  indices.push(lastFullSection + 10, tipSection + 8, lastFullSection + 11);
  indices.push(lastFullSection + 11, tipSection + 8, lastFullSection + 12);
  indices.push(lastFullSection + 12, tipSection + 8, lastFullSection + 13);
  indices.push(lastFullSection + 13, tipSection + 8, lastFullSection + 14);
  indices.push(lastFullSection + 14, tipSection + 8, lastFullSection + 8);

  // Close the wall thickness at bow tip - connect outer edge to inner edge
  // This creates a wedge that seals the wall around the entire bow profile
  // Each segment: outer[i] -> outer tip -> inner tip -> inner[i+8]

  // Bottom segment (outer 0,1 to inner 8,9)
  indices.push(lastFullSection + 0, tipSection + 0, tipSection + 8);
  indices.push(lastFullSection + 0, tipSection + 8, lastFullSection + 8);
  indices.push(lastFullSection + 1, lastFullSection + 0, lastFullSection + 8);
  indices.push(lastFullSection + 1, lastFullSection + 8, lastFullSection + 9);

  // Left bilge (outer 1,2 to inner 9,10)
  indices.push(lastFullSection + 2, lastFullSection + 1, lastFullSection + 9);
  indices.push(lastFullSection + 2, lastFullSection + 9, lastFullSection + 10);

  // Left wall (outer 2,3 to inner 10,11)
  indices.push(lastFullSection + 3, lastFullSection + 2, lastFullSection + 10);
  indices.push(lastFullSection + 3, lastFullSection + 10, lastFullSection + 11);

  // Top rim left (outer 3 to inner 11) - connects to tip
  indices.push(lastFullSection + 3, lastFullSection + 11, tipSection + 8);
  indices.push(lastFullSection + 3, tipSection + 8, tipSection + 0);

  // Top rim right (outer 4 to inner 12) - connects to tip
  indices.push(lastFullSection + 4, tipSection + 0, tipSection + 8);
  indices.push(lastFullSection + 4, tipSection + 8, lastFullSection + 12);

  // Right wall (outer 4,5 to inner 12,13)
  indices.push(lastFullSection + 5, lastFullSection + 4, lastFullSection + 12);
  indices.push(lastFullSection + 5, lastFullSection + 12, lastFullSection + 13);

  // Right bilge (outer 5,6 to inner 13,14)
  indices.push(lastFullSection + 6, lastFullSection + 5, lastFullSection + 13);
  indices.push(lastFullSection + 6, lastFullSection + 13, lastFullSection + 14);

  // Bottom right segment (outer 6,0 to inner 14,8)
  indices.push(lastFullSection + 0, lastFullSection + 6, lastFullSection + 14);
  indices.push(lastFullSection + 0, lastFullSection + 14, lastFullSection + 8);

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
    const bilgeSegments = 8;
    for (let i = 1; i <= bilgeSegments; i++) {
      const angle = (Math.PI / 2) * (i / bilgeSegments);
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
    const bilgeSegments = 8;
    for (let i = 1; i <= bilgeSegments; i++) {
      const angle = (Math.PI / 2) * (i / bilgeSegments);
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
