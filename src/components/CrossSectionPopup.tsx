import { useEffect, useRef, useState, useCallback } from 'react';
import type { BoatParams } from '../types/boatParams';
import styles from './CrossSectionPopup.module.css';

interface CrossSectionPopupProps {
  axis: 'x' | 'y' | 'z';
  position: number;
  params: BoatParams;
  calculatedLength: number;
  onClose: () => void;
}

export function CrossSectionPopup({
  axis,
  position,
  params,
  calculatedLength,
  onClose,
}: CrossSectionPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.5, Math.min(5, z * zoomFactor)));
  }, []);

  // Handle pan start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    lastPanPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle pan move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastPanPos.current.x;
    const dy = e.clientY - lastPanPos.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastPanPos.current = { x: e.clientX, y: e.clientY };
  }, [isPanning]);

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Reset view
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Attach wheel listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate hull parameters
    const { beam, hullHeight, bilgeRadius, wallThickness, bowLengthPercent } = params;
    const bowLength = calculatedLength * (bowLengthPercent / 100);
    const sternLength = calculatedLength - bowLength;
    const hullCenterZ = (bowLength - sternLength) / 2;

    const halfBeam = beam / 2;
    const innerHalfBeam = Math.max(0.1, halfBeam - wallThickness);
    const r = Math.min(bilgeRadius, halfBeam - 0.1, hullHeight - 0.1);
    const innerR = Math.max(0, r - wallThickness);
    const innerBottom = wallThickness;

    // Determine bounds and scale based on axis
    let width: number, height: number;
    let label: string;

    if (axis === 'y') {
      // Y cut: showing XZ plane (plan view)
      width = beam;
      height = calculatedLength;
      label = `Y = ${position.toFixed(1)}mm (Plan View)`;
    } else if (axis === 'x') {
      // X cut: showing YZ plane (side view)
      width = calculatedLength;
      height = hullHeight;
      label = `X = ${position.toFixed(1)}mm (Side View)`;
    } else {
      // Z cut: showing XY plane (cross-section)
      width = beam;
      height = hullHeight;
      label = `Z = ${position.toFixed(1)}mm (Cross-Section)`;
    }

    // Calculate scale to fit canvas with padding, then apply zoom
    const padding = 40;
    const scaleX = (canvas.width - padding * 2) / width;
    const scaleY = (canvas.height - padding * 2) / height;
    const baseScale = Math.min(scaleX, scaleY);
    const scale = baseScale * zoom;

    // Center offset with pan
    const offsetX = canvas.width / 2 + pan.x;
    const offsetY = canvas.height / 2 + pan.y;

    // Transform functions
    const toCanvasX = (x: number) => offsetX + x * scale;
    const toCanvasY = (y: number) => offsetY - y * scale; // Flip Y for canvas

    // Draw based on axis
    ctx.lineWidth = 2;

    if (axis === 'z') {
      // Z cut: Classic U-shaped hull cross-section
      let zScale = 1;
      if (position > -hullCenterZ) {
        const bowT = (position + hullCenterZ) / bowLength;
        zScale = Math.max(0, 1 - bowT);
      }

      if (zScale < 0.02) {
        ctx.fillStyle = '#888';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Position is at bow tip - no cross-section', canvas.width / 2, canvas.height / 2);
      } else {
        const scaledHalfBeam = halfBeam * zScale;
        const scaledInnerHalfBeam = innerHalfBeam * zScale;
        const scaledR = r * zScale;
        const scaledInnerR = innerR * zScale;

        // Draw outer U-shape
        ctx.beginPath();
        ctx.strokeStyle = '#e07030';
        ctx.fillStyle = '#e07030';

        // Start at bottom center
        ctx.moveTo(toCanvasX(0), toCanvasY(0));

        // Left bilge curve
        const numSegments = 20;
        for (let i = 0; i <= numSegments; i++) {
          const angle = (Math.PI / 2) * (i / numSegments);
          const x = -(scaledHalfBeam - scaledR) - Math.sin(angle) * scaledR;
          const y = scaledR - Math.cos(angle) * scaledR;
          ctx.lineTo(toCanvasX(x), toCanvasY(y));
        }

        // Left side up
        ctx.lineTo(toCanvasX(-scaledHalfBeam), toCanvasY(hullHeight));

        // Right side down
        ctx.lineTo(toCanvasX(scaledHalfBeam), toCanvasY(hullHeight));

        // Right bilge curve
        for (let i = numSegments; i >= 0; i--) {
          const angle = (Math.PI / 2) * (i / numSegments);
          const x = (scaledHalfBeam - scaledR) + Math.sin(angle) * scaledR;
          const y = scaledR - Math.cos(angle) * scaledR;
          ctx.lineTo(toCanvasX(x), toCanvasY(y));
        }

        ctx.closePath();
        ctx.fill();

        // Cut out inner U-shape (draw with background color)
        if (scaledInnerHalfBeam > 0.5) {
          ctx.beginPath();
          ctx.fillStyle = '#1a1a2e';

          // Start at inner bottom center
          ctx.moveTo(toCanvasX(0), toCanvasY(innerBottom));

          // Left inner bilge curve
          for (let i = 0; i <= numSegments; i++) {
            const angle = (Math.PI / 2) * (i / numSegments);
            const x = -(scaledInnerHalfBeam - scaledInnerR) - Math.sin(angle) * scaledInnerR;
            const y = innerBottom + scaledInnerR - Math.cos(angle) * scaledInnerR;
            ctx.lineTo(toCanvasX(x), toCanvasY(y));
          }

          // Left inner side up
          ctx.lineTo(toCanvasX(-scaledInnerHalfBeam), toCanvasY(hullHeight));

          // Right inner side
          ctx.lineTo(toCanvasX(scaledInnerHalfBeam), toCanvasY(hullHeight));

          // Right inner bilge curve
          for (let i = numSegments; i >= 0; i--) {
            const angle = (Math.PI / 2) * (i / numSegments);
            const x = (scaledInnerHalfBeam - scaledInnerR) + Math.sin(angle) * scaledInnerR;
            const y = innerBottom + scaledInnerR - Math.cos(angle) * scaledInnerR;
            ctx.lineTo(toCanvasX(x), toCanvasY(y));
          }

          ctx.closePath();
          ctx.fill();
        }

        // Draw dimension lines
        ctx.strokeStyle = '#4a9eff';
        ctx.fillStyle = '#4a9eff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';

        // Wall thickness indicator (left side)
        const dimY = hullHeight * 0.7;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(-scaledHalfBeam), toCanvasY(dimY));
        ctx.lineTo(toCanvasX(-scaledInnerHalfBeam), toCanvasY(dimY));
        ctx.stroke();

        ctx.fillText(
          `${wallThickness.toFixed(1)}mm`,
          toCanvasX((-scaledHalfBeam - scaledInnerHalfBeam) / 2),
          toCanvasY(dimY) - 5
        );

        // Bottom thickness indicator
        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), toCanvasY(0));
        ctx.lineTo(toCanvasX(0), toCanvasY(innerBottom));
        ctx.stroke();

        ctx.fillText(
          `${wallThickness.toFixed(1)}mm`,
          toCanvasX(0) + 30,
          toCanvasY(innerBottom / 2)
        );
      }
    } else if (axis === 'y') {
      // Y cut: Plan view (looking down)
      const yPos = position;

      // Calculate X extent at this Y height
      let outerX: number;
      if (yPos <= r) {
        const dy = yPos - r;
        outerX = (halfBeam - r) + Math.sqrt(Math.max(0, r * r - dy * dy));
      } else {
        outerX = halfBeam;
      }

      let innerX = 0;
      if (yPos > innerBottom) {
        if (yPos <= innerBottom + innerR) {
          const dy = yPos - (innerBottom + innerR);
          innerX = (innerHalfBeam - innerR) + Math.sqrt(Math.max(0, innerR * innerR - dy * dy));
        } else {
          innerX = innerHalfBeam;
        }
      }

      const zMin = -sternLength - hullCenterZ;
      const zMax = bowLength - hullCenterZ;

      // Adjust toCanvas for this view (X horizontal, Z vertical)
      const toCanvasXPlan = (x: number) => offsetX + x * scale;
      const toCanvasZPlan = (z: number) => offsetY - z * scale;

      // Draw outer hull shape
      ctx.beginPath();
      ctx.fillStyle = '#e07030';

      const numPoints = 50;
      // Left side (stern to bow)
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const z = zMin + t * (zMax - zMin);

        let zScale = 1;
        if (z > -hullCenterZ) {
          const bowT = (z + hullCenterZ) / bowLength;
          zScale = Math.max(0, 1 - bowT);
        }

        const scaledOuterX = outerX * zScale;
        if (i === 0) {
          ctx.moveTo(toCanvasXPlan(-scaledOuterX), toCanvasZPlan(z));
        } else {
          ctx.lineTo(toCanvasXPlan(-scaledOuterX), toCanvasZPlan(z));
        }
      }

      // Right side (bow to stern)
      for (let i = numPoints; i >= 0; i--) {
        const t = i / numPoints;
        const z = zMin + t * (zMax - zMin);

        let zScale = 1;
        if (z > -hullCenterZ) {
          const bowT = (z + hullCenterZ) / bowLength;
          zScale = Math.max(0, 1 - bowT);
        }

        const scaledOuterX = outerX * zScale;
        ctx.lineTo(toCanvasXPlan(scaledOuterX), toCanvasZPlan(z));
      }

      ctx.closePath();
      ctx.fill();

      // Cut out inner hull - maintain wall thickness from outer surface
      if (innerX > 0.1) {
        ctx.beginPath();
        ctx.fillStyle = '#1a1a2e';

        const innerZMin = zMin + wallThickness;

        // Calculate where inner bow tip should end (where outer width = wallThickness)
        // outerX * (1 - bowT) = wallThickness  =>  bowT = 1 - wallThickness/outerX
        const innerBowT = Math.max(0, 1 - wallThickness / outerX);
        const innerZMax = -hullCenterZ + bowLength * innerBowT;

        // Collect points for a proper closed path
        const innerPoints: { x: number; z: number }[] = [];

        // Left inner side (stern to bow)
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints;
          const z = innerZMin + t * (innerZMax - innerZMin);

          // Calculate outer X at this Z position
          let zScale = 1;
          if (z > -hullCenterZ) {
            const bowT = (z + hullCenterZ) / bowLength;
            zScale = Math.max(0, 1 - bowT);
          }
          const scaledOuterX = outerX * zScale;

          // Inner X maintains wall thickness from outer
          const scaledInnerX = Math.max(0, scaledOuterX - wallThickness);
          if (scaledInnerX < 0.1) continue;

          innerPoints.push({ x: -scaledInnerX, z });
        }

        // Right inner side (bow to stern)
        for (let i = numPoints; i >= 0; i--) {
          const t = i / numPoints;
          const z = innerZMin + t * (innerZMax - innerZMin);

          let zScale = 1;
          if (z > -hullCenterZ) {
            const bowT = (z + hullCenterZ) / bowLength;
            zScale = Math.max(0, 1 - bowT);
          }
          const scaledOuterX = outerX * zScale;
          const scaledInnerX = Math.max(0, scaledOuterX - wallThickness);
          if (scaledInnerX < 0.1) continue;

          innerPoints.push({ x: scaledInnerX, z });
        }

        // Draw the inner contour
        if (innerPoints.length >= 3) {
          ctx.moveTo(toCanvasXPlan(innerPoints[0].x), toCanvasZPlan(innerPoints[0].z));
          for (let i = 1; i < innerPoints.length; i++) {
            ctx.lineTo(toCanvasXPlan(innerPoints[i].x), toCanvasZPlan(innerPoints[i].z));
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      // Wall thickness label
      ctx.strokeStyle = '#4a9eff';
      ctx.fillStyle = '#4a9eff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Wall: ${wallThickness.toFixed(1)}mm`, canvas.width / 2, canvas.height - 60);
    } else {
      // X cut: Side view
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('X-axis cross-section (side view)', canvas.width / 2, canvas.height / 2);
      ctx.fillText(`At X = ${position.toFixed(1)}mm`, canvas.width / 2, canvas.height / 2 + 20);
    }

    // Draw title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, canvas.width / 2, 25);

    // Draw axes indicator
    ctx.strokeStyle = '#666';
    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';

    if (axis === 'z') {
      ctx.fillText('← X →', 10, canvas.height - 10);
      ctx.fillText('↑ Y', 10, canvas.height - 25);
    } else if (axis === 'y') {
      ctx.fillText('← X →', 10, canvas.height - 10);
      ctx.fillText('↑ Z (bow)', 10, canvas.height - 25);
    }

  }, [axis, position, params, calculatedLength, zoom, pan]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <canvas
          ref={canvasRef}
          width={500}
          height={400}
          className={styles.canvas}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <div className={styles.info}>
          <p>Orange = solid material (wall thickness: {params.wallThickness}mm)</p>
          <p>Scroll to zoom, drag to pan. Zoom: {(zoom * 100).toFixed(0)}%</p>
          <button className={styles.resetBtn} onClick={resetView}>Reset View</button>
        </div>
      </div>
    </div>
  );
}
