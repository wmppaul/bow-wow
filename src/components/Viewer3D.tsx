import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { BoatParams } from '../types/boatParams';
import { HullMesh } from './HullMesh';
import { BuildPlate } from './BuildPlate';
import { WaterlinePlane } from './WaterlinePlane';
import { exportToSTL } from '../utils/stlExport';
import styles from './Viewer3D.module.css';

interface Viewer3DProps {
  params: BoatParams;
  calculatedLength: number;
  waterlineHeight: number;
}

type ViewMode = 'perspective' | 'orthographic';
type ViewPreset = 'home' | 'top' | 'bottom' | 'front' | 'right' | 'back' | 'left';

interface CameraControllerProps {
  viewPreset: ViewPreset;
  target: [number, number, number];
}

function CameraController({ viewPreset, target }: CameraControllerProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const lastPresetRef = useRef<ViewPreset | null>(null);

  // Only update camera position when viewPreset changes, not when target changes
  useEffect(() => {
    // Skip if this is just a target update, not a preset change
    if (lastPresetRef.current === viewPreset) {
      return;
    }
    lastPresetRef.current = viewPreset;

    const distance = 200;
    let position: [number, number, number];

    switch (viewPreset) {
      case 'home':
        position = [150, 100, 150];
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
        position = [150, 100, 150];
    }

    camera.position.set(...position);
    camera.lookAt(target[0], target[1], target[2]);

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

function Scene({
  params,
  calculatedLength,
  waterlineHeight,
  viewMode,
  viewPreset,
}: Viewer3DProps & { viewMode: ViewMode; viewPreset: ViewPreset }) {
  const hullGroupRef = useRef<THREE.Group>(null);
  const target: [number, number, number] = [0, params.hullHeight / 2, 0];

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

  return (
    <>
      {viewMode === 'perspective' ? (
        <PerspectiveCamera makeDefault fov={50} position={[150, 100, 150]} />
      ) : (
        <OrthographicCamera makeDefault zoom={2} position={[150, 100, 150]} />
      )}

      <CameraController viewPreset={viewPreset} target={target} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[100, 100, 50]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-50, 50, -50]} intensity={0.3} />

      <BuildPlate size={params.buildPlateSize} />

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

      <group ref={hullGroupRef}>
        <HullMesh params={params} calculatedLength={calculatedLength} />
      </group>

      <WaterlinePlane
        waterlineHeight={waterlineHeight}
        length={calculatedLength}
        beam={params.beam}
      />
    </>
  );
}

// Toggle pairs for view presets
const viewTogglePairs: Record<ViewPreset, ViewPreset> = {
  home: 'home',
  top: 'bottom',
  bottom: 'top',
  front: 'back',
  back: 'front',
  right: 'left',
  left: 'right',
};

export function Viewer3D({ params, calculatedLength, waterlineHeight }: Viewer3DProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('home');

  // Handle view preset toggle - if clicking same view, switch to opposite
  const handleViewPreset = (preset: ViewPreset) => {
    if (viewPreset === preset) {
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
          setViewPreset('home');
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
            className={`${styles.viewBtn} ${viewPreset === 'home' ? styles.active : ''}`}
            onClick={() => handleViewPreset('home')}
            title="Home (H)"
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

      <Canvas shadows>
        <Scene
          params={params}
          calculatedLength={calculatedLength}
          waterlineHeight={waterlineHeight}
          viewMode={viewMode}
          viewPreset={viewPreset}
        />
      </Canvas>
    </div>
  );
}
