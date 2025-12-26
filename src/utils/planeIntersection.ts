import * as THREE from 'three';

interface IntersectionSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

/**
 * Compute the intersection of a plane with a mesh geometry.
 * Returns an array of closed loops (each loop is an array of Vector3 points).
 */
export function computePlaneIntersection(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane
): THREE.Vector3[][] {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();

  if (!position || !index) {
    return [];
  }

  const segments: IntersectionSegment[] = [];

  // Iterate through all triangles
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  for (let i = 0; i < index.count; i += 3) {
    const i0 = index.getX(i);
    const i1 = index.getX(i + 1);
    const i2 = index.getX(i + 2);

    v0.fromBufferAttribute(position, i0);
    v1.fromBufferAttribute(position, i1);
    v2.fromBufferAttribute(position, i2);

    // Get signed distances from plane
    const d0 = plane.distanceToPoint(v0);
    const d1 = plane.distanceToPoint(v1);
    const d2 = plane.distanceToPoint(v2);

    // Find intersection points (where sign changes)
    const intersections: THREE.Vector3[] = [];

    // Edge v0-v1
    if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) {
      const t = d0 / (d0 - d1);
      intersections.push(new THREE.Vector3().lerpVectors(v0, v1, t));
    } else if (Math.abs(d0) < 1e-6) {
      intersections.push(v0.clone());
    }

    // Edge v1-v2
    if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
      const t = d1 / (d1 - d2);
      intersections.push(new THREE.Vector3().lerpVectors(v1, v2, t));
    } else if (Math.abs(d1) < 1e-6 && intersections.length === 0) {
      intersections.push(v1.clone());
    }

    // Edge v2-v0
    if ((d2 > 0 && d0 < 0) || (d2 < 0 && d0 > 0)) {
      const t = d2 / (d2 - d0);
      intersections.push(new THREE.Vector3().lerpVectors(v2, v0, t));
    } else if (Math.abs(d2) < 1e-6 && intersections.length < 2) {
      intersections.push(v2.clone());
    }

    // If we have exactly 2 intersection points, we have a segment
    if (intersections.length === 2) {
      segments.push({ start: intersections[0], end: intersections[1] });
    }
  }

  // Connect segments into closed loops
  return connectSegmentsIntoLoops(segments);
}

/**
 * Connect intersection segments into closed loops.
 * Segments that share endpoints are connected together.
 */
function connectSegmentsIntoLoops(segments: IntersectionSegment[]): THREE.Vector3[][] {
  if (segments.length === 0) return [];

  const loops: THREE.Vector3[][] = [];
  const used = new Set<number>();
  const epsilon = 0.01; // Tolerance for point matching

  const pointsEqual = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    return a.distanceTo(b) < epsilon;
  };

  // Find segment that connects to a given point
  const findConnectingSegment = (point: THREE.Vector3, excludeIndices: Set<number>): { index: number; reverse: boolean } | null => {
    for (let i = 0; i < segments.length; i++) {
      if (excludeIndices.has(i)) continue;
      if (pointsEqual(segments[i].start, point)) {
        return { index: i, reverse: false };
      }
      if (pointsEqual(segments[i].end, point)) {
        return { index: i, reverse: true };
      }
    }
    return null;
  };

  // Build loops
  while (used.size < segments.length) {
    // Find an unused segment to start a new loop
    let startIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (!used.has(i)) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) break;

    const loop: THREE.Vector3[] = [];
    let currentIdx = startIdx;
    let currentEnd = segments[currentIdx].end;

    loop.push(segments[currentIdx].start.clone());
    loop.push(segments[currentIdx].end.clone());
    used.add(currentIdx);

    // Try to extend the loop
    let iterations = 0;
    const maxIterations = segments.length;

    while (iterations < maxIterations) {
      iterations++;
      const next = findConnectingSegment(currentEnd, used);
      if (!next) break;

      used.add(next.index);
      const seg = segments[next.index];

      if (next.reverse) {
        loop.push(seg.start.clone());
        currentEnd = seg.start;
      } else {
        loop.push(seg.end.clone());
        currentEnd = seg.end;
      }

      // Check if loop is closed
      if (pointsEqual(currentEnd, loop[0])) {
        break;
      }
    }

    // Only add loops with at least 3 points
    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

/**
 * Calculate the signed area of a 2D polygon (positive = CCW, negative = CW)
 */
function calculateSignedArea(points: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area / 2;
}

/**
 * Triangulate a set of loops into a BufferGeometry.
 * Identifies outer boundary vs holes and creates proper ring geometry.
 */
export function triangulateCrossSection(
  loops: THREE.Vector3[][],
  plane: THREE.Plane
): THREE.BufferGeometry | null {
  if (loops.length === 0) return null;

  // Project points to 2D for triangulation
  const normal = plane.normal;
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  // Choose projection plane based on dominant normal component
  let projectTo2D: (v: THREE.Vector3) => [number, number];

  if (absY >= absX && absY >= absZ) {
    // Y is dominant - project to XZ plane
    projectTo2D = (v) => [v.x, v.z];
  } else if (absX >= absZ) {
    // X is dominant - project to YZ plane
    projectTo2D = (v) => [v.y, v.z];
  } else {
    // Z is dominant - project to XY plane
    projectTo2D = (v) => [v.x, v.y];
  }

  // Convert loops to 2D and calculate their areas
  const loops2D: { points2D: [number, number][]; points3D: THREE.Vector3[]; area: number }[] = [];

  for (const loop of loops) {
    if (loop.length < 3) continue;
    const points2D = loop.map(projectTo2D);
    const area = Math.abs(calculateSignedArea(points2D));
    loops2D.push({ points2D, points3D: loop, area });
  }

  if (loops2D.length === 0) return null;

  // Sort by area - largest is outer boundary, smaller ones are holes
  loops2D.sort((a, b) => b.area - a.area);

  const outerLoop = loops2D[0];

  // Convert our points to Vector2 for ShapeUtils triangulation
  const outerPoints2D = outerLoop.points2D.map(p => new THREE.Vector2(p[0], p[1]));
  const holePoints2D = loops2D.slice(1).map(loop =>
    loop.points2D.map(p => new THREE.Vector2(p[0], p[1]))
  );

  // Triangulate using ShapeUtils
  const triangles = THREE.ShapeUtils.triangulateShape(outerPoints2D, holePoints2D);

  if (triangles.length === 0) return null;

  // Build combined 3D vertex list (outer + all holes in order)
  const all3DPoints: THREE.Vector3[] = [...outerLoop.points3D];
  for (let h = 1; h < loops2D.length; h++) {
    all3DPoints.push(...loops2D[h].points3D);
  }

  // Build geometry
  const vertices: number[] = [];
  const indices: number[] = [];

  // Add all 3D vertices
  for (const pt of all3DPoints) {
    vertices.push(pt.x, pt.y, pt.z);
  }

  // Add triangle indices (ShapeUtils returns indices into the combined vertex array)
  for (const tri of triangles) {
    indices.push(tri[0], tri[1], tri[2]);
  }

  if (vertices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}
