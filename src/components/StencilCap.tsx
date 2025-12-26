import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

interface StencilCapProps {
  axis: 'x' | 'y' | 'z';
  position: number;
  size: number;
  hullGeometry: THREE.BufferGeometry;
  clippingPlane: THREE.Plane;
}

// Stencil cap uses a 3-pass technique:
// 1. Render back faces with stencil increment
// 2. Render front faces with stencil decrement
// 3. Render cap plane where stencil != 0

export function StencilCap({ axis, position, size, hullGeometry, clippingPlane }: StencilCapProps) {
  const backMeshRef = useRef<THREE.Mesh>(null);
  const frontMeshRef = useRef<THREE.Mesh>(null);
  const capMeshRef = useRef<THREE.Mesh>(null);

  // Calculate cap plane position and rotation based on axis
  const getCapPosition = (): [number, number, number] => {
    switch (axis) {
      case 'x': return [position, size / 4, 0];
      case 'y': return [0, position, 0];
      case 'z': return [0, size / 4, position];
    }
  };

  const getCapRotation = (): [number, number, number] => {
    switch (axis) {
      case 'x': return [0, Math.PI / 2, 0];
      case 'y': return [Math.PI / 2, 0, 0];
      case 'z': return [0, 0, 0];
    }
  };

  // Create materials with stencil operations
  const backMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    colorWrite: false,
    depthWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.IncrementWrapStencilOp,
    clippingPlanes: [clippingPlane],
  });

  const frontMaterial = new THREE.MeshBasicMaterial({
    side: THREE.FrontSide,
    colorWrite: false,
    depthWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.DecrementWrapStencilOp,
    clippingPlanes: [clippingPlane],
  });

  const capMaterial = new THREE.MeshStandardMaterial({
    color: '#e07030', // Same as hull color
    side: THREE.DoubleSide,
    stencilWrite: false,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilRef: 0,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
  });

  // Set render order to ensure correct sequence
  useEffect(() => {
    if (backMeshRef.current) backMeshRef.current.renderOrder = 1;
    if (frontMeshRef.current) frontMeshRef.current.renderOrder = 2;
    if (capMeshRef.current) capMeshRef.current.renderOrder = 3;
  }, []);

  return (
    <group>
      {/* Pass 1: Back faces - increment stencil */}
      <mesh
        ref={backMeshRef}
        geometry={hullGeometry}
        material={backMaterial}
      />

      {/* Pass 2: Front faces - decrement stencil */}
      <mesh
        ref={frontMeshRef}
        geometry={hullGeometry}
        material={frontMaterial}
      />

      {/* Pass 3: Cap plane - render where stencil != 0 */}
      <mesh
        ref={capMeshRef}
        position={getCapPosition()}
        rotation={getCapRotation()}
        material={capMaterial}
      >
        <planeGeometry args={[size, size]} />
      </mesh>
    </group>
  );
}
