import { useMemo } from 'react';
import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';

interface HullMeshProps {
  params: BoatParams;
  calculatedLength: number;
}

/**
 * Create complete hull geometry (stern + bow as one continuous mesh)
 * This ensures no gaps between sections
 */
function createHullGeometry(
  params: BoatParams,
  sternLength: number,
  bowLength: number
): THREE.BufferGeometry {
  const { beam, hullHeight, bilgeRadius, wallThickness } = params;

  const vertices: number[] = [];
  const indices: number[] = [];

  // Points per cross-section: 12 points (6 outer + 6 inner)
  const pointsPerSection = 12;

  // Generate cross-section at a given z position with a scale factor
  const addCrossSection = (z: number, scale: number) => {
    const halfBeam = (beam / 2) * scale;
    const r = Math.max(0, Math.min(bilgeRadius * scale, halfBeam - 0.1, hullHeight - 0.1));

    const innerHalfBeam = Math.max(0.1, halfBeam - wallThickness * scale);
    const innerR = Math.max(0, r - wallThickness * scale);
    const innerBottom = wallThickness * Math.max(0.5, scale);

    if (halfBeam < 0.5 || scale < 0.05) {
      // Collapsed to center line
      for (let i = 0; i < 6; i++) vertices.push(0, 0, z);
      for (let i = 0; i < 6; i++) vertices.push(0, innerBottom, z);
    } else {
      // Outer profile (6 points)
      vertices.push(0, 0, z);                    // 0: bottom center
      vertices.push(-(halfBeam - r), 0, z);      // 1: bottom-left before bilge
      vertices.push(-halfBeam, r, z);            // 2: left at bilge top
      vertices.push(-halfBeam, hullHeight, z);   // 3: top-left
      vertices.push(halfBeam, hullHeight, z);    // 4: top-right
      vertices.push(halfBeam, r, z);             // 5: right at bilge top

      // Inner profile (6 points)
      const innerBilgeY = innerBottom + innerR;
      vertices.push(0, innerBottom, z);                      // 6: inner bottom center
      vertices.push(-(innerHalfBeam - innerR), innerBottom, z); // 7: inner bottom-left
      vertices.push(-innerHalfBeam, innerBilgeY, z);         // 8: inner left at bilge
      vertices.push(-innerHalfBeam, hullHeight, z);          // 9: inner top-left
      vertices.push(innerHalfBeam, hullHeight, z);           // 10: inner top-right
      vertices.push(innerHalfBeam, innerBilgeY, z);          // 11: inner right at bilge
    }
  };

  // Generate all cross-sections from stern to bow tip
  const sternSections = 2;  // Just need 2 for constant section
  const bowSections = 16;   // More for the taper

  // Stern section (constant cross-section, z from -sternLength to 0)
  for (let i = 0; i <= sternSections; i++) {
    const t = i / sternSections;
    const z = -sternLength + t * sternLength;
    addCrossSection(z, 1.0); // Full scale throughout stern
  }

  // Bow section (tapered, z from 0 to bowLength)
  for (let i = 1; i <= bowSections; i++) {
    const t = i / bowSections;
    const z = t * bowLength;
    const scale = 1 - t; // Linear taper to 0
    addCrossSection(z, scale);
  }

  // Create faces between adjacent sections
  const numSections = sternSections + 1 + bowSections;
  for (let sec = 0; sec < numSections - 1; sec++) {
    const curr = sec * pointsPerSection;
    const next = (sec + 1) * pointsPerSection;

    // Outer bottom - left half (0 to 1)
    indices.push(curr + 0, curr + 1, next + 1);
    indices.push(curr + 0, next + 1, next + 0);

    // Outer bottom - right half (0 to 5, mirrored)
    indices.push(curr + 0, next + 5, curr + 5);
    indices.push(curr + 0, next + 0, next + 5);

    // Outer left bilge (1 to 2)
    indices.push(curr + 1, curr + 2, next + 2);
    indices.push(curr + 1, next + 2, next + 1);

    // Outer right bilge (5 to 4 direction, but we go 5->4)
    // Actually 5 is at bilge, need to add bottom-right point
    // For now, connect 5 directly - this creates the right bilge
    indices.push(curr + 5, next + 5, next + 4);
    indices.push(curr + 5, next + 4, curr + 4);

    // Outer left wall (2 to 3)
    indices.push(curr + 2, curr + 3, next + 3);
    indices.push(curr + 2, next + 3, next + 2);

    // Outer right wall (5 to 4) - already done above combined with bilge

    // Inner bottom - left half (6 to 7) - reversed winding
    indices.push(curr + 6, next + 7, curr + 7);
    indices.push(curr + 6, next + 6, next + 7);

    // Inner bottom - right half (6 to 11)
    indices.push(curr + 6, curr + 11, next + 11);
    indices.push(curr + 6, next + 11, next + 6);

    // Inner left bilge (7 to 8)
    indices.push(curr + 7, next + 8, curr + 8);
    indices.push(curr + 7, next + 7, next + 8);

    // Inner right bilge (11 to 10)
    indices.push(curr + 11, curr + 10, next + 10);
    indices.push(curr + 11, next + 10, next + 11);

    // Inner left wall (8 to 9)
    indices.push(curr + 8, next + 9, curr + 9);
    indices.push(curr + 8, next + 8, next + 9);

    // Inner right wall (11 to 10) - done with bilge

    // Top of left wall (outer 3 to inner 9)
    indices.push(curr + 3, curr + 9, next + 9);
    indices.push(curr + 3, next + 9, next + 3);

    // Top of right wall (outer 4 to inner 10)
    indices.push(curr + 4, next + 10, curr + 10);
    indices.push(curr + 4, next + 4, next + 10);
  }

  // Stern end cap (close the back)
  // Connect outer to inner at z = -sternLength
  const sternStart = 0;
  // Bottom: outer 0,1 to inner 6,7
  indices.push(sternStart + 0, sternStart + 6, sternStart + 7);
  indices.push(sternStart + 0, sternStart + 7, sternStart + 1);
  // Left bilge: outer 1,2 to inner 7,8
  indices.push(sternStart + 1, sternStart + 7, sternStart + 8);
  indices.push(sternStart + 1, sternStart + 8, sternStart + 2);
  // Left wall: outer 2,3 to inner 8,9
  indices.push(sternStart + 2, sternStart + 8, sternStart + 9);
  indices.push(sternStart + 2, sternStart + 9, sternStart + 3);
  // Right wall: outer 4,5 to inner 10,11
  indices.push(sternStart + 5, sternStart + 4, sternStart + 10);
  indices.push(sternStart + 5, sternStart + 10, sternStart + 11);
  // Right bilge: outer 5,0 to inner 11,6
  indices.push(sternStart + 0, sternStart + 5, sternStart + 11);
  indices.push(sternStart + 0, sternStart + 11, sternStart + 6);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

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
  const { hullGeometry, motorMountGeometry } = useMemo(() => {
    const bowLength = calculatedLength * (params.bowLengthPercent / 100);
    const sternLength = calculatedLength - bowLength;

    return {
      hullGeometry: createHullGeometry(params, sternLength, bowLength),
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

      {/* Motor mount */}
      <mesh geometry={motorMountGeometry} castShadow>
        <meshStandardMaterial color="#505050" />
      </mesh>
    </group>
  );
}
