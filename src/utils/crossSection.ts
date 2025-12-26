import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';

/**
 * Compute the hull cross-section at a given Y height.
 * Returns a BufferGeometry representing the wall thickness ring.
 */
export function computeYCrossSection(
  params: BoatParams,
  yPosition: number,
  calculatedLength: number
): THREE.BufferGeometry | null {
  const { beam, hullHeight, bilgeRadius, wallThickness, bowLengthPercent } = params;

  // Don't render if outside hull bounds
  if (yPosition < 0 || yPosition > hullHeight) return null;

  const bowLength = calculatedLength * (bowLengthPercent / 100);
  const sternLength = calculatedLength - bowLength;
  const hullCenterZ = (bowLength - sternLength) / 2;

  const halfBeam = beam / 2;
  const innerHalfBeam = Math.max(0.1, halfBeam - wallThickness);
  const r = Math.min(bilgeRadius, halfBeam - 0.1, hullHeight - 0.1);
  const innerR = Math.max(0, r - wallThickness);
  const innerBottom = wallThickness;

  // Calculate where we are in the cross-section
  // The hull has a U-shape: flat bottom, curved bilge, vertical sides

  // For a given Y, find the X extent of outer and inner profiles
  // Also find the Z extent (how far bow/stern the hull extends at this height)

  const outerPoints: THREE.Vector2[] = []; // X, Z coordinates
  const innerPoints: THREE.Vector2[] = [];

  // At height y, what's the X extent?
  // Below bilge radius: we're in the curved part
  // Above bilge radius: we're in the straight sides

  let outerXLeft: number, outerXRight: number;
  let innerXLeft: number, innerXRight: number;

  if (yPosition <= r) {
    // In the bilge curve region
    // Circle equation: (x - (halfBeam - r))^2 + (y - r)^2 = r^2
    // Solve for x: x = (halfBeam - r) + sqrt(r^2 - (y - r)^2)
    const dy = yPosition - r;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    outerXRight = (halfBeam - r) + dx;
    outerXLeft = -outerXRight;
  } else {
    // Above bilge curve - straight sides
    outerXRight = halfBeam;
    outerXLeft = -halfBeam;
  }

  if (yPosition <= innerBottom) {
    // Below inner bottom - no inner surface here
    innerXLeft = 0;
    innerXRight = 0;
  } else if (yPosition <= innerBottom + innerR) {
    // In inner bilge curve region
    const dy = yPosition - (innerBottom + innerR);
    const dx = Math.sqrt(Math.max(0, innerR * innerR - dy * dy));
    innerXRight = (innerHalfBeam - innerR) + dx;
    innerXLeft = -innerXRight;
  } else {
    // Above inner bilge curve
    innerXRight = innerHalfBeam;
    innerXLeft = -innerHalfBeam;
  }

  // Now compute Z extent at this height for the bow taper
  // The bow tapers from full beam at z=0 to point at z=bowLength
  // At any Z in the bow section, scale = 1 - z/bowLength
  // At the current Y and outer X extent, find max Z where hull exists

  // For the stern, it's constant (no taper)
  const sternZ = -sternLength - hullCenterZ;

  // For the bow, find where the taper reaches our current X extent
  // scale = outerX / halfBeam, so z = bowLength * (1 - scale)
  // But we need to account for Y too since the profile changes

  // Simplified: at each X position, the bow extends to z = bowLength * (1 - |x|/halfBeam)
  // But this is approximate. For accurate results, we need to trace the actual hull.

  // For now, let's create a simpler cross-section at y=yPosition
  // Generate points around the perimeter at this Y height

  const numPoints = 64;
  const vertices: number[] = [];
  const indices: number[] = [];

  // Generate outer contour points (in XZ plane at y=yPosition)
  // Walk from stern to bow on left side, then bow to stern on right side

  // For each Z position, calculate the X extent and check if point is inside hull
  const zMin = sternZ;
  const zMax = bowLength - hullCenterZ;

  // Sample Z positions
  const outerContour: THREE.Vector2[] = []; // [x, z] pairs
  const innerContour: THREE.Vector2[] = [];

  // Left side outer (from stern to bow)
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const z = zMin + t * (zMax - zMin);

    // Calculate scale at this Z (1 at stern, 0 at bow tip)
    let scale = 1;
    if (z > -hullCenterZ) {
      // In bow section
      const bowT = (z + hullCenterZ) / bowLength;
      scale = Math.max(0, 1 - bowT);
    }

    // Calculate outer X at this Z and Y
    let x: number;
    const scaledR = r * scale;
    const scaledHalfBeam = halfBeam * scale;

    if (scale < 0.01) {
      // At bow tip
      x = 0;
    } else if (yPosition <= scaledR) {
      const dy = yPosition - scaledR;
      const dxSq = scaledR * scaledR - dy * dy;
      if (dxSq < 0) continue; // Y is outside hull at this Z
      x = -((scaledHalfBeam - scaledR) + Math.sqrt(dxSq));
    } else {
      x = -scaledHalfBeam;
    }

    if (!isNaN(x) && isFinite(x)) {
      outerContour.push(new THREE.Vector2(x, z));
    }
  }

  // Right side outer (from bow to stern)
  for (let i = numPoints; i >= 0; i--) {
    const t = i / numPoints;
    const z = zMin + t * (zMax - zMin);

    let scale = 1;
    if (z > -hullCenterZ) {
      const bowT = (z + hullCenterZ) / bowLength;
      scale = Math.max(0, 1 - bowT);
    }

    let x: number;
    const scaledR = r * scale;
    const scaledHalfBeam = halfBeam * scale;

    if (scale < 0.01) {
      x = 0;
    } else if (yPosition <= scaledR) {
      const dy = yPosition - scaledR;
      const dxSq = scaledR * scaledR - dy * dy;
      if (dxSq < 0) continue;
      x = (scaledHalfBeam - scaledR) + Math.sqrt(dxSq);
    } else {
      x = scaledHalfBeam;
    }

    if (!isNaN(x) && isFinite(x)) {
      outerContour.push(new THREE.Vector2(x, z));
    }
  }

  // Inner contour (only if above inner bottom)
  if (yPosition > innerBottom) {
    // Left side inner (from stern to bow)
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const z = zMin + wallThickness + t * (zMax - zMin - wallThickness * 2);

      let scale = 1;
      if (z > -hullCenterZ) {
        const bowT = (z + hullCenterZ) / bowLength;
        scale = Math.max(0, 1 - bowT);
      }

      const scaledInnerR = innerR * scale;
      const scaledInnerHalfBeam = innerHalfBeam * scale;

      let x: number;
      if (scale < 0.05) {
        continue; // Skip near bow tip
      } else if (yPosition <= innerBottom + scaledInnerR) {
        const dy = yPosition - (innerBottom + scaledInnerR);
        const dxSq = scaledInnerR * scaledInnerR - dy * dy;
        if (dxSq < 0) continue;
        x = -((scaledInnerHalfBeam - scaledInnerR) + Math.sqrt(dxSq));
      } else {
        x = -scaledInnerHalfBeam;
      }

      if (!isNaN(x) && isFinite(x) && Math.abs(x) > 0.1) {
        innerContour.push(new THREE.Vector2(x, z));
      }
    }

    // Right side inner (from bow to stern)
    for (let i = numPoints; i >= 0; i--) {
      const t = i / numPoints;
      const z = zMin + wallThickness + t * (zMax - zMin - wallThickness * 2);

      let scale = 1;
      if (z > -hullCenterZ) {
        const bowT = (z + hullCenterZ) / bowLength;
        scale = Math.max(0, 1 - bowT);
      }

      const scaledInnerR = innerR * scale;
      const scaledInnerHalfBeam = innerHalfBeam * scale;

      let x: number;
      if (scale < 0.05) {
        continue;
      } else if (yPosition <= innerBottom + scaledInnerR) {
        const dy = yPosition - (innerBottom + scaledInnerR);
        const dxSq = scaledInnerR * scaledInnerR - dy * dy;
        if (dxSq < 0) continue;
        x = (scaledInnerHalfBeam - scaledInnerR) + Math.sqrt(dxSq);
      } else {
        x = scaledInnerHalfBeam;
      }

      if (!isNaN(x) && isFinite(x) && Math.abs(x) > 0.1) {
        innerContour.push(new THREE.Vector2(x, z));
      }
    }
  }

  if (outerContour.length < 3) return null;

  // Use THREE.Shape for triangulation with hole
  const shape = new THREE.Shape(outerContour);

  if (innerContour.length >= 3) {
    const holePath = new THREE.Path(innerContour);
    shape.holes.push(holePath);
  }

  // Create geometry from shape
  const shapeGeom = new THREE.ShapeGeometry(shape);

  // Transform from XZ plane to XYZ (rotate and translate to Y position)
  const positions = shapeGeom.getAttribute('position');
  const newPositions = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i); // ShapeGeometry puts 2D y into 3D y
    newPositions[i * 3] = x;
    newPositions[i * 3 + 1] = yPosition;
    newPositions[i * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  geometry.setIndex(shapeGeom.getIndex());
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Compute cross-section for X plane (cutting through beam)
 */
export function computeXCrossSection(
  params: BoatParams,
  xPosition: number,
  calculatedLength: number
): THREE.BufferGeometry | null {
  const { beam, hullHeight, bilgeRadius, wallThickness, bowLengthPercent } = params;

  const halfBeam = beam / 2;
  if (Math.abs(xPosition) > halfBeam) return null;

  const bowLength = calculatedLength * (bowLengthPercent / 100);
  const sternLength = calculatedLength - bowLength;
  const hullCenterZ = (bowLength - sternLength) / 2;

  const r = Math.min(bilgeRadius, halfBeam - 0.1, hullHeight - 0.1);
  const innerR = Math.max(0, r - wallThickness);
  const innerHalfBeam = Math.max(0.1, halfBeam - wallThickness);
  const innerBottom = wallThickness;

  const absX = Math.abs(xPosition);

  // Calculate Y profile at this X position
  // Below bilge: curved, above bilge: straight up to hullHeight

  let outerYBottom: number;
  let innerYBottom: number;

  // Outer profile
  if (absX <= halfBeam - r) {
    // In flat bottom region
    outerYBottom = 0;
  } else {
    // In bilge curve region
    const dx = absX - (halfBeam - r);
    outerYBottom = r - Math.sqrt(Math.max(0, r * r - dx * dx));
  }

  // Inner profile
  if (absX <= innerHalfBeam - innerR) {
    innerYBottom = innerBottom;
  } else if (absX <= innerHalfBeam) {
    const dx = absX - (innerHalfBeam - innerR);
    innerYBottom = innerBottom + innerR - Math.sqrt(Math.max(0, innerR * innerR - dx * dx));
  } else {
    // Outside inner hull
    innerYBottom = hullHeight; // No inner surface
  }

  // Generate contour in YZ plane
  const numPoints = 64;
  const outerContour: THREE.Vector2[] = [];
  const innerContour: THREE.Vector2[] = [];

  const zMin = -sternLength - hullCenterZ;
  const zMax = bowLength - hullCenterZ;

  // For each Z, calculate if we're inside the hull at this X
  // Outer contour: bottom edge
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const z = zMin + t * (zMax - zMin);

    // Scale factor for bow taper
    let scale = 1;
    if (z > -hullCenterZ) {
      const bowT = (z + hullCenterZ) / bowLength;
      scale = Math.max(0, 1 - bowT);
    }

    const scaledHalfBeam = halfBeam * scale;
    if (absX > scaledHalfBeam) continue; // Outside hull at this Z

    const scaledR = r * scale;
    let yBottom: number;

    if (scale < 0.01) {
      yBottom = 0;
    } else if (absX <= scaledHalfBeam - scaledR) {
      yBottom = 0;
    } else {
      const dx = absX - (scaledHalfBeam - scaledR);
      yBottom = scaledR - Math.sqrt(Math.max(0, scaledR * scaledR - dx * dx));
    }

    outerContour.push(new THREE.Vector2(z, yBottom));
  }

  // Outer contour: top edge (reverse direction)
  for (let i = numPoints; i >= 0; i--) {
    const t = i / numPoints;
    const z = zMin + t * (zMax - zMin);

    let scale = 1;
    if (z > -hullCenterZ) {
      const bowT = (z + hullCenterZ) / bowLength;
      scale = Math.max(0, 1 - bowT);
    }

    const scaledHalfBeam = halfBeam * scale;
    if (absX > scaledHalfBeam) continue;

    outerContour.push(new THREE.Vector2(z, hullHeight));
  }

  // Inner contour (if this X is inside inner hull)
  const absXInner = absX;
  if (absXInner < innerHalfBeam) {
    // Bottom edge of inner
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const z = zMin + wallThickness + t * (zMax - zMin - wallThickness * 2);

      let scale = 1;
      if (z > -hullCenterZ) {
        const bowT = (z + hullCenterZ) / bowLength;
        scale = Math.max(0, 1 - bowT);
      }

      const scaledInnerHalfBeam = innerHalfBeam * scale;
      if (absXInner > scaledInnerHalfBeam || scale < 0.05) continue;

      const scaledInnerR = innerR * scale;
      let yBottom: number;

      if (absXInner <= scaledInnerHalfBeam - scaledInnerR) {
        yBottom = innerBottom;
      } else {
        const dx = absXInner - (scaledInnerHalfBeam - scaledInnerR);
        yBottom = innerBottom + scaledInnerR - Math.sqrt(Math.max(0, scaledInnerR * scaledInnerR - dx * dx));
      }

      innerContour.push(new THREE.Vector2(z, yBottom));
    }

    // Top edge of inner (reverse)
    for (let i = numPoints; i >= 0; i--) {
      const t = i / numPoints;
      const z = zMin + wallThickness + t * (zMax - zMin - wallThickness * 2);

      let scale = 1;
      if (z > -hullCenterZ) {
        const bowT = (z + hullCenterZ) / bowLength;
        scale = Math.max(0, 1 - bowT);
      }

      const scaledInnerHalfBeam = innerHalfBeam * scale;
      if (absXInner > scaledInnerHalfBeam || scale < 0.05) continue;

      innerContour.push(new THREE.Vector2(z, hullHeight));
    }
  }

  if (outerContour.length < 3) return null;

  const shape = new THREE.Shape(outerContour);
  if (innerContour.length >= 3) {
    shape.holes.push(new THREE.Path(innerContour));
  }

  const shapeGeom = new THREE.ShapeGeometry(shape);
  const positions = shapeGeom.getAttribute('position');
  const newPositions = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const z = positions.getX(i);
    const y = positions.getY(i);
    newPositions[i * 3] = xPosition;
    newPositions[i * 3 + 1] = y;
    newPositions[i * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  geometry.setIndex(shapeGeom.getIndex());
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Compute cross-section for Z plane (cutting along length)
 */
export function computeZCrossSection(
  params: BoatParams,
  zPosition: number,
  calculatedLength: number
): THREE.BufferGeometry | null {
  const { beam, hullHeight, bilgeRadius, wallThickness, bowLengthPercent } = params;

  const bowLength = calculatedLength * (bowLengthPercent / 100);
  const sternLength = calculatedLength - bowLength;
  const hullCenterZ = (bowLength - sternLength) / 2;

  const zMin = -sternLength - hullCenterZ;
  const zMax = bowLength - hullCenterZ;

  if (zPosition < zMin || zPosition > zMax) return null;

  // Calculate scale at this Z position
  let scale = 1;
  if (zPosition > -hullCenterZ) {
    const bowT = (zPosition + hullCenterZ) / bowLength;
    scale = Math.max(0, 1 - bowT);
  }

  if (scale < 0.02) return null; // Too close to bow tip

  const halfBeam = beam / 2 * scale;
  const innerHalfBeam = Math.max(0.1, (beam / 2 - wallThickness) * scale);
  const r = Math.min(bilgeRadius, beam / 2 - 0.1, hullHeight - 0.1) * scale;
  const innerR = Math.max(0, (bilgeRadius - wallThickness) * scale);
  const innerBottom = wallThickness;

  // Generate U-shaped profile in XY plane
  const numPoints = 32;
  const outerContour: THREE.Vector2[] = [];
  const innerContour: THREE.Vector2[] = [];

  // Outer contour: start from bottom-left, go around U shape
  // Left side going up
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = Math.PI / 2 * t; // 0 to 90 degrees
    const x = -(halfBeam - r) - Math.sin(angle) * r;
    const y = r - Math.cos(angle) * r;
    outerContour.push(new THREE.Vector2(x, y));
  }
  // Left side straight up
  outerContour.push(new THREE.Vector2(-halfBeam, hullHeight));
  // Right side straight up (top to bilge)
  outerContour.push(new THREE.Vector2(halfBeam, hullHeight));
  // Right side going down
  for (let i = numPoints; i >= 0; i--) {
    const t = i / numPoints;
    const angle = Math.PI / 2 * t;
    const x = (halfBeam - r) + Math.sin(angle) * r;
    const y = r - Math.cos(angle) * r;
    outerContour.push(new THREE.Vector2(x, y));
  }

  // Inner contour (if scale allows)
  if (innerHalfBeam > 0.5 && innerR >= 0) {
    // Left side going up
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const angle = Math.PI / 2 * t;
      const x = -(innerHalfBeam - Math.max(0, innerR)) - Math.sin(angle) * Math.max(0, innerR);
      const y = innerBottom + Math.max(0, innerR) - Math.cos(angle) * Math.max(0, innerR);
      innerContour.push(new THREE.Vector2(x, y));
    }
    innerContour.push(new THREE.Vector2(-innerHalfBeam, hullHeight));
    innerContour.push(new THREE.Vector2(innerHalfBeam, hullHeight));
    for (let i = numPoints; i >= 0; i--) {
      const t = i / numPoints;
      const angle = Math.PI / 2 * t;
      const x = (innerHalfBeam - Math.max(0, innerR)) + Math.sin(angle) * Math.max(0, innerR);
      const y = innerBottom + Math.max(0, innerR) - Math.cos(angle) * Math.max(0, innerR);
      innerContour.push(new THREE.Vector2(x, y));
    }
  }

  if (outerContour.length < 3) return null;

  const shape = new THREE.Shape(outerContour);
  if (innerContour.length >= 3) {
    shape.holes.push(new THREE.Path(innerContour));
  }

  const shapeGeom = new THREE.ShapeGeometry(shape);
  const positions = shapeGeom.getAttribute('position');
  const newPositions = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    newPositions[i * 3] = x;
    newPositions[i * 3 + 1] = y;
    newPositions[i * 3 + 2] = zPosition;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  geometry.setIndex(shapeGeom.getIndex());
  geometry.computeVertexNormals();

  return geometry;
}
