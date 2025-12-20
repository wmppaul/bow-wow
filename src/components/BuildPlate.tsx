import * as THREE from 'three';
import { useMemo } from 'react';

interface BuildPlateProps {
  size: number;
  fitsOnPlate: boolean;
}

export function BuildPlate({ size, fitsOnPlate }: BuildPlateProps) {
  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(size, 0.5, size);
    return new THREE.EdgesGeometry(box);
  }, [size]);

  // Color based on fit status
  const plateColor = fitsOnPlate ? '#2a4a2a' : '#4a2a2a';
  const edgeColor = fitsOnPlate ? '#4a9eff' : '#ff4a4a';
  const cornerColor = fitsOnPlate ? '#4a9eff' : '#ff4a4a';

  return (
    <group>
      {/* Build plate outline */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={edgeColor} />
      </lineSegments>

      {/* Semi-transparent plate */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[size, 0.5, size]} />
        <meshStandardMaterial
          color={plateColor}
          transparent
          opacity={0.4}
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
          <meshStandardMaterial color={cornerColor} />
        </mesh>
      ))}
    </group>
  );
}
