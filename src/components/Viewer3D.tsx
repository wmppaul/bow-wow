import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';
import type { ClipPlanesConfig } from '../types/clipPlane';
import { HullMesh } from './HullMesh';
import { BuildPlate } from './BuildPlate';
import { WaterlinePlane } from './WaterlinePlane';
import { ClipPlaneVisual } from './ClipPlaneVisual';
import { exportToSTL } from '../utils/stlExport';
import styles from './Viewer3D.module.css';

interface Viewer3DProps {
  params: BoatParams;
  calculatedLength: number;
  waterlineHeight: number;
  clipPlanes: ClipPlanesConfig;
  onClipPlanesChange: (clipPlanes: ClipPlanesConfig) => void;
}

type ViewMode = 'perspective' | 'orthographic';
type ViewPreset = 'home' | 'home2' | 'home3' | 'home4' | 'top' | 'bottom' | 'front' | 'right' | 'back' | 'left';

interface CameraControllerProps {
  viewPreset: ViewPreset;
  target: [number, number, number];
  viewMode: ViewMode;
}

// Store camera state globally so it persists across mode switches
const cameraState = {
  position: new THREE.Vector3(150, 100, 150),
  target: new THREE.Vector3(0, 12.5, 0),
};

function CameraController({ viewPreset, target, viewMode }: CameraControllerProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const lastPresetRef = useRef<ViewPreset | null>(null);
  const lastViewModeRef = useRef<ViewMode | null>(null);
  const restoreFramesRef = useRef(0);

  // On mode change, flag that we need to restore position for a few frames
  useEffect(() => {
    if (lastViewModeRef.current !== null && lastViewModeRef.current !== viewMode) {
      // Mode changed - need to restore position over next few frames
      restoreFramesRef.current = 5; // Restore for 5 frames to ensure it sticks
    }
    lastViewModeRef.current = viewMode;
  }, [viewMode]);

  // Use frame loop to restore camera position after mode switch
  useFrame(() => {
    if (restoreFramesRef.current > 0) {
      camera.position.copy(cameraState.position);
      if (controlsRef.current) {
        controlsRef.current.target.copy(cameraState.target);
        controlsRef.current.update();
      }
      restoreFramesRef.current--;
    } else {
      // Save current state
      cameraState.position.copy(camera.position);
      if (controlsRef.current) {
        cameraState.target.copy(controlsRef.current.target);
      }
    }
  });

  // Only update camera position when viewPreset changes, not when target changes
  useEffect(() => {
    // Skip if this is just a target update, not a preset change
    if (lastPresetRef.current === viewPreset) {
      return;
    }
    lastPresetRef.current = viewPreset;

    const distance = 200;
    let position: [number, number, number];

    const homeDistance = 180;
    const homeHeight = 100;
    switch (viewPreset) {
      case 'home':
        position = [homeDistance, homeHeight, homeDistance];
        break;
      case 'home2': // 90° rotation
        position = [homeDistance, homeHeight, -homeDistance];
        break;
      case 'home3': // 180° rotation
        position = [-homeDistance, homeHeight, -homeDistance];
        break;
      case 'home4': // 270° rotation
        position = [-homeDistance, homeHeight, homeDistance];
        break;
      case 'top': // XZ plane (looking down Y)
        position = [0, distance, 0];
        break;
      case 'bottom': // XZ plane (looking up Y)
        position = [0, -distance, 0];
        break;
      case 'front': // Looking at bow (from +Z)
        position = [0, target[1], distance];
        break;
      case 'back': // Looking at stern (from -Z)
        position = [0, target[1], -distance];
        break;
      case 'right': // From +X
        position = [distance, target[1], 0];
        break;
      case 'left': // From -X
        position = [-distance, target[1], 0];
        break;
      default:
        position = [homeDistance, homeHeight, homeDistance];
    }

    camera.position.set(...position);
    camera.lookAt(target[0], target[1], target[2]);

    // Save state
    cameraState.position.copy(camera.position);
    cameraState.target.set(target[0], target[1], target[2]);

    if (controlsRef.current) {
      controlsRef.current.target.set(...target);
      controlsRef.current.update();
    }
  }, [viewPreset, camera, target]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={20}
      maxDistance={500}
    />
  );
}

interface SceneProps extends Viewer3DProps {
  viewMode: ViewMode;
  viewPreset: ViewPreset;
  fitsOnPlate: boolean;
  rakeExtension: number;
}

function Scene({
  params,
  calculatedLength,
  waterlineHeight,
  clipPlanes,
  onClipPlanesChange,
  viewMode,
  viewPreset,
  fitsOnPlate,
  rakeExtension,
}: SceneProps) {
  const hullGroupRef = useRef<THREE.Group>(null);
  const target: [number, number, number] = [0, params.hullHeight / 2, 0];

  // Create THREE.Plane objects for clipping
  const threeClipPlanes = useMemo(() => {
    const planes: THREE.Plane[] = [];

    if (clipPlanes.x.enabled) {
      // X plane: normal points in -X direction (clips everything with x > position)
      planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), clipPlanes.x.position));
    }
    if (clipPlanes.y.enabled) {
      // Y plane: normal points in -Y direction (clips everything with y > position)
      planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), clipPlanes.y.position));
    }
    if (clipPlanes.z.enabled) {
      // Z plane: normal points in -Z direction (clips everything with z > position)
      planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), clipPlanes.z.position));
    }

    return planes;
  }, [clipPlanes]);

  // Listen for STL export event
  useEffect(() => {
    const handleExport = () => {
      if (hullGroupRef.current) {
        hullGroupRef.current.updateMatrixWorld(true);
        exportToSTL(hullGroupRef.current, `boat-hull-${Date.now()}.stl`);
      }
    };

    window.addEventListener('exportSTL', handleExport);
    return () => window.removeEventListener('exportSTL', handleExport);
  }, []);

  // Helper to update clip plane position
  const updateClipPosition = (axis: 'x' | 'y' | 'z', position: number) => {
    onClipPlanesChange({
      ...clipPlanes,
      [axis]: { ...clipPlanes[axis], position },
    });
  };

  return (
    <>
      {viewMode === 'perspective' ? (
        <PerspectiveCamera makeDefault fov={50} position={[150, 100, 150]} />
      ) : (
        <OrthographicCamera makeDefault zoom={2} position={[150, 100, 150]} />
      )}

      <CameraController viewPreset={viewPreset} target={target} viewMode={viewMode} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[100, 100, 50]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-50, 50, -50]} intensity={0.3} />

      {/* Build plate rotated 45° so boat fits diagonally */}
      <group rotation={[0, Math.PI / 4, 0]}>
        <BuildPlate size={params.buildPlateSize} fitsOnPlate={fitsOnPlate} />
      </group>

      <Grid
        args={[300, 300]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#333"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#444"
        fadeDistance={400}
        position={[0, -0.1, 0]}
      />

      {/* Hull - shifted to optimally fit on 45° rotated plate */}
      {/* Wide stern needs to be closer to plate center, narrow bow can extend to plate tip */}
      {/* For raked bow, reduce shift to account for rake extension */}
      <group ref={hullGroupRef} position={[0, 0, params.beam / 4 - rakeExtension / 2]}>
        <HullMesh
          params={params}
          calculatedLength={calculatedLength}
          clippingPlanes={threeClipPlanes}
          showCaps={clipPlanes.showCaps}
        />
      </group>

      <WaterlinePlane
        waterlineHeight={waterlineHeight}
        length={calculatedLength}
        beam={params.beam}
      />

      {/* Clip plane visuals */}
      {clipPlanes.x.enabled && (
        <ClipPlaneVisual
          axis="x"
          position={clipPlanes.x.position}
          size={Math.max(params.hullHeight, calculatedLength) * 1.5}
          onPositionChange={(pos) => updateClipPosition('x', pos)}
        />
      )}
      {clipPlanes.y.enabled && (
        <ClipPlaneVisual
          axis="y"
          position={clipPlanes.y.position}
          size={Math.max(params.beam, calculatedLength) * 1.5}
          onPositionChange={(pos) => updateClipPosition('y', pos)}
        />
      )}
      {clipPlanes.z.enabled && (
        <ClipPlaneVisual
          axis="z"
          position={clipPlanes.z.position}
          size={Math.max(params.beam, params.hullHeight) * 1.5}
          onPositionChange={(pos) => updateClipPosition('z', pos)}
        />
      )}
    </>
  );
}

// Toggle pairs for view presets
const viewTogglePairs: Record<ViewPreset, ViewPreset> = {
  home: 'home2',
  home2: 'home3',
  home3: 'home4',
  home4: 'home',
  top: 'bottom',
  bottom: 'top',
  front: 'back',
  back: 'front',
  right: 'left',
  left: 'right',
};

// Check if a preset is a home variant
const isHomePreset = (preset: ViewPreset) =>
  preset === 'home' || preset === 'home2' || preset === 'home3' || preset === 'home4';

export function Viewer3D({ params, calculatedLength, waterlineHeight, clipPlanes, onClipPlanesChange }: Viewer3DProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('home');

  // Check if boat fits on build plate (45° rotated plate with optimal positioning)
  // With boat shifted by beam/4 toward bow, the constraint is: length ≤ plateSize*√2 - beam/2
  // For raked bow, the top of the bow tip extends forward by: hullHeight * tan(rakeAngle)
  const rakeExtension = params.bowType === 'raked'
    ? params.hullHeight * Math.tan(params.bowRakeAngle * Math.PI / 180)
    : 0;
  const effectiveLength = calculatedLength + rakeExtension;
  const maxFitLength = params.buildPlateSize * Math.SQRT2 - params.beam / 2;
  const fitsOnPlate = effectiveLength <= maxFitLength;

  // Handle view preset toggle - if clicking same view, switch to opposite/next
  const handleViewPreset = (preset: ViewPreset) => {
    // For home button, always cycle to next home position
    if (preset === 'home') {
      if (isHomePreset(viewPreset)) {
        setViewPreset(viewTogglePairs[viewPreset]);
      } else {
        setViewPreset('home');
      }
    } else if (viewPreset === preset) {
      setViewPreset(viewTogglePairs[preset]);
    } else {
      setViewPreset(preset);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key.toLowerCase()) {
        case 'p':
          setViewMode('perspective');
          break;
        case 'o':
          setViewMode('orthographic');
          break;
        case 'h':
          handleViewPreset('home');
          break;
        case 't':
          setViewPreset('top');
          break;
        case 'f':
          setViewPreset('front');
          break;
        case 'b':
          setViewPreset('back');
          break;
        case 'r':
          setViewPreset('right');
          break;
        case 'l':
          setViewPreset('left');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={styles.container}>
      {/* View controls overlay */}
      <div className={styles.viewControls}>
        <div className={styles.controlGroup}>
          <span className={styles.label}>View:</span>
          <button
            className={`${styles.viewBtn} ${viewMode === 'perspective' ? styles.active : ''}`}
            onClick={() => setViewMode('perspective')}
            title="Perspective (P)"
          >
            Persp
          </button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'orthographic' ? styles.active : ''}`}
            onClick={() => setViewMode('orthographic')}
            title="Orthographic (O)"
          >
            Ortho
          </button>
        </div>
        <div className={styles.controlGroup}>
          <button
            className={`${styles.viewBtn} ${isHomePreset(viewPreset) ? styles.active : ''}`}
            onClick={() => handleViewPreset('home')}
            title="Home - rotate 90° each click (H)"
          >
            Home
          </button>
          <button
            className={`${styles.viewBtn} ${viewPreset === 'top' || viewPreset === 'bottom' ? styles.active : ''}`}
            onClick={() => handleViewPreset('top')}
            title={viewPreset === 'top' ? 'Bottom (click again)' : viewPreset === 'bottom' ? 'Top (click again)' : 'Top - XZ (T)'}
          >
            {viewPreset === 'bottom' ? 'Bot' : 'Top'}
          </button>
          <button
            className={`${styles.viewBtn} ${viewPreset === 'front' || viewPreset === 'back' ? styles.active : ''}`}
            onClick={() => handleViewPreset('front')}
            title={viewPreset === 'front' ? 'Back (click again)' : viewPreset === 'back' ? 'Front (click again)' : 'Front - XY (F)'}
          >
            {viewPreset === 'back' ? 'Back' : 'Front'}
          </button>
          <button
            className={`${styles.viewBtn} ${viewPreset === 'right' || viewPreset === 'left' ? styles.active : ''}`}
            onClick={() => handleViewPreset('right')}
            title={viewPreset === 'right' ? 'Left (click again)' : viewPreset === 'left' ? 'Right (click again)' : 'Right - YZ (R)'}
          >
            {viewPreset === 'left' ? 'Left' : 'Right'}
          </button>
        </div>
      </div>

      <Canvas shadows gl={{ localClippingEnabled: true, stencil: true }}>
        <Scene
          params={params}
          calculatedLength={calculatedLength}
          waterlineHeight={waterlineHeight}
          clipPlanes={clipPlanes}
          onClipPlanesChange={onClipPlanesChange}
          viewMode={viewMode}
          viewPreset={viewPreset}
          fitsOnPlate={fitsOnPlate}
          rakeExtension={rakeExtension}
        />
      </Canvas>
    </div>
  );
}
