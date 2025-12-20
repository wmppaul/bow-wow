import * as THREE from 'three';
import { useMemo } from 'react';

interface BuildPlateProps {
  size: number;
}

export function BuildPlate({ size }: BuildPlateProps) {
  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(size, 0.5, size);
    return new THREE.EdgesGeometry(box);
  }, [size]);

  return (
    <group>
      {/* Build plate outline */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color="#666" />
      </lineSegments>

      {/* Semi-transparent plate */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[size, 0.5, size]} />
        <meshStandardMaterial
          color="#333"
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Corner markers */}
      {[
        [-size / 2, 0, -size / 2],
        [size / 2, 0, -size / 2],
        [-size / 2, 0, size / 2],
        [size / 2, 0, size / 2],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[2, 16, 16]} />
          <meshStandardMaterial color="#4a9eff" />
        </mesh>
      ))}
    </group>
  );
}
