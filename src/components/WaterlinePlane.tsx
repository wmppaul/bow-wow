interface WaterlinePlaneProps {
  waterlineHeight: number;
  length: number;
  beam: number;
}

export function WaterlinePlane({ waterlineHeight, length, beam }: WaterlinePlaneProps) {
  // Only show if waterline is above 0
  if (waterlineHeight <= 0) return null;

  const planeSize = Math.max(length, beam) * 1.5;

  return (
    <mesh
      position={[0, waterlineHeight, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[planeSize, planeSize]} />
      <meshStandardMaterial
        color="#0066cc"
        transparent
        opacity={0.3}
        side={2} // DoubleSide
      />
    </mesh>
  );
}
