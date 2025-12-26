import { useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ClipPlaneVisualProps {
  axis: 'x' | 'y' | 'z';
  position: number;
  size: number;
  onPositionChange: (position: number) => void;
}

// Colors for each axis
const AXIS_COLORS = {
  x: '#ff4444', // Red for X
  y: '#44ff44', // Green for Y
  z: '#4444ff', // Blue for Z
};

export function ClipPlaneVisual({ axis, position, size, onPositionChange }: ClipPlaneVisualProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef<{ pointerPos: THREE.Vector3; planePos: number } | null>(null);
  const { camera, raycaster } = useThree();

  // Calculate position and rotation based on axis
  const getPositionArray = (): [number, number, number] => {
    switch (axis) {
      case 'x': return [position, size / 4, 0];
      case 'y': return [0, position, 0];
      case 'z': return [0, size / 4, position];
    }
  };

  const getRotation = (): [number, number, number] => {
    switch (axis) {
      case 'x': return [0, Math.PI / 2, 0]; // Rotate to face X
      case 'y': return [Math.PI / 2, 0, 0]; // Rotate to face Y (horizontal)
      case 'z': return [0, 0, 0]; // Default facing Z
    }
  };

  // Project a point onto the axis line for dragging
  const projectToAxis = (point: THREE.Vector3): number => {
    switch (axis) {
      case 'x': return point.x;
      case 'y': return point.y;
      case 'z': return point.z;
    }
  };

  const handlePointerDown = (e: THREE.Event) => {
    e.stopPropagation();
    setIsDragging(true);

    // Store initial state for drag
    const pointerPos = (e as any).point as THREE.Vector3;
    dragStartRef.current = {
      pointerPos: pointerPos.clone(),
      planePos: position,
    };

    // Capture pointer
    (e as any).target?.setPointerCapture?.((e as any).pointerId);
  };

  const handlePointerMove = (e: THREE.Event) => {
    if (!isDragging || !dragStartRef.current) return;

    const currentPoint = (e as any).point as THREE.Vector3;
    if (!currentPoint) return;

    // Calculate delta along the axis
    const startAxisPos = projectToAxis(dragStartRef.current.pointerPos);
    const currentAxisPos = projectToAxis(currentPoint);
    const delta = currentAxisPos - startAxisPos;

    // Update position
    const newPosition = dragStartRef.current.planePos + delta;
    onPositionChange(newPosition);
  };

  const handlePointerUp = (e: THREE.Event) => {
    setIsDragging(false);
    dragStartRef.current = null;
    (e as any).target?.releasePointerCapture?.((e as any).pointerId);
  };

  const color = AXIS_COLORS[axis];
  const opacity = isDragging ? 0.5 : isHovered ? 0.4 : 0.25;

  return (
    <mesh
      ref={meshRef}
      position={getPositionArray()}
      rotation={getRotation()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerOver={() => setIsHovered(true)}
      onPointerOut={() => {
        setIsHovered(false);
        if (!isDragging) {
          dragStartRef.current = null;
        }
      }}
    >
      <planeGeometry args={[size, size / 2]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
