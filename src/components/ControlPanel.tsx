import type { BoatParams, BowType } from '../types/boatParams';
import { calculateMaxLength, PENNY_WEIGHT } from '../types/boatParams';
import styles from './ControlPanel.module.css';

interface ControlPanelProps {
  params: BoatParams;
  onChange: (params: BoatParams) => void;
  onSave: () => void;
  onLoad: () => void;
  onExportSTL: () => void;
  calculatedLength: number;
  waterlineHeight: number;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function SliderRow({ label, value, min, max, step = 1, unit = 'mm', onChange, disabled }: SliderRowProps) {
  return (
    <div className={styles.sliderRow}>
      <label className={styles.label}>{label}</label>
      <div className={styles.sliderContainer}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
        />
        <div className={styles.valueDisplay}>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || min)}
            disabled={disabled}
          />
          <span className={styles.unit}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

export function ControlPanel({
  params,
  onChange,
  onSave,
  onLoad,
  onExportSTL,
  calculatedLength,
  waterlineHeight,
}: ControlPanelProps) {
  const update = <K extends keyof BoatParams>(key: K, value: BoatParams[K]) => {
    onChange({ ...params, [key]: value });
  };

  const maxLength = calculateMaxLength(params.buildPlateSize, params.beam);
  const pennyCount = Math.round(params.ballastWeight / PENNY_WEIGHT * 10) / 10;

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Boat Hull Designer</h1>

      {/* File operations */}
      <div className={styles.section}>
        <div className={styles.buttonRow}>
          <button onClick={onSave}>Save JSON</button>
          <button onClick={onLoad}>Load JSON</button>
          <button onClick={onExportSTL}>Export STL</button>
        </div>
      </div>

      {/* Build Plate */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Build Plate</h2>
        <SliderRow
          label="Plate Size"
          value={params.buildPlateSize}
          min={100}
          max={300}
          onChange={(v) => update('buildPlateSize', v)}
        />
        <div className={styles.infoRow}>
          <span>Max Length (diagonal):</span>
          <span className={styles.infoValue}>{maxLength.toFixed(1)} mm</span>
        </div>
        <div className={styles.infoRow}>
          <span>Calculated Length:</span>
          <span className={styles.infoValue}>{calculatedLength.toFixed(1)} mm</span>
        </div>
      </div>

      {/* Hull Dimensions */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Hull Dimensions</h2>
        <SliderRow
          label="Beam (Width)"
          value={params.beam}
          min={20}
          max={80}
          onChange={(v) => update('beam', v)}
        />
        <SliderRow
          label="Hull Height"
          value={params.hullHeight}
          min={15}
          max={50}
          onChange={(v) => update('hullHeight', v)}
        />
        <SliderRow
          label="Wall Thickness"
          value={params.wallThickness}
          min={0.8}
          max={3}
          step={0.1}
          onChange={(v) => update('wallThickness', v)}
        />
        <SliderRow
          label="Bilge Radius"
          value={params.bilgeRadius}
          min={0}
          max={Math.min(params.beam / 4, params.hullHeight / 2)}
          step={0.5}
          onChange={(v) => update('bilgeRadius', v)}
        />
      </div>

      {/* Bow Configuration */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Bow Configuration</h2>
        <div className={styles.selectRow}>
          <label className={styles.label}>Bow Type</label>
          <select
            value={params.bowType}
            onChange={(e) => update('bowType', e.target.value as BowType)}
          >
            <option value="plumb">Plumb (Flat)</option>
            <option value="raked">Raked (Angled)</option>
            <option value="deepV">Deep V</option>
          </select>
        </div>
        <SliderRow
          label="Bow Length"
          value={params.bowLengthPercent}
          min={20}
          max={60}
          unit="%"
          onChange={(v) => update('bowLengthPercent', v)}
        />
        {params.bowType === 'raked' && (
          <SliderRow
            label="Rake Angle"
            value={params.bowRakeAngle}
            min={10}
            max={60}
            unit="°"
            onChange={(v) => update('bowRakeAngle', v)}
          />
        )}
        {params.bowType === 'deepV' && (
          <SliderRow
            label="Entry Angle"
            value={params.bowEntryAngle}
            min={10}
            max={45}
            unit="°"
            onChange={(v) => update('bowEntryAngle', v)}
          />
        )}
      </div>

      {/* Motor Mount */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Motor Mount</h2>
        <SliderRow
          label="Cylinder Diameter"
          value={params.motorMountDiameter}
          min={2}
          max={8}
          step={0.5}
          onChange={(v) => update('motorMountDiameter', v)}
        />
        <SliderRow
          label="Offset Below Hull"
          value={params.motorMountOffset}
          min={0}
          max={5}
          step={0.5}
          onChange={(v) => update('motorMountOffset', v)}
        />
        <SliderRow
          label="Neck Width"
          value={params.motorMountNeckWidth}
          min={1}
          max={6}
          step={0.5}
          onChange={(v) => update('motorMountNeckWidth', v)}
        />
        <SliderRow
          label="Mount Length"
          value={params.motorMountLength}
          min={10}
          max={40}
          onChange={(v) => update('motorMountLength', v)}
        />
        <SliderRow
          label="Distance from Stern"
          value={params.motorMountFromStern}
          min={20}
          max={100}
          onChange={(v) => update('motorMountFromStern', v)}
        />
      </div>

      {/* Physics / Weights */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Weights & Waterline</h2>
        <SliderRow
          label="Motor Weight"
          value={params.motorWeight}
          min={0}
          max={50}
          unit="g"
          onChange={(v) => update('motorWeight', v)}
        />
        <SliderRow
          label="Battery Weight"
          value={params.batteryWeight}
          min={0}
          max={100}
          unit="g"
          onChange={(v) => update('batteryWeight', v)}
        />
        <SliderRow
          label="Ballast"
          value={params.ballastWeight}
          min={0}
          max={100}
          step={PENNY_WEIGHT}
          unit="g"
          onChange={(v) => update('ballastWeight', v)}
        />
        <div className={styles.infoRow}>
          <span>Ballast (pennies):</span>
          <span className={styles.infoValue}>~{pennyCount} pennies</span>
        </div>
        <div className={styles.infoRow}>
          <span>Waterline Height:</span>
          <span className={styles.infoValue}>{waterlineHeight.toFixed(1)} mm</span>
        </div>
      </div>
    </div>
  );
}
