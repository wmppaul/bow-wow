import { useState, useCallback } from 'react';
import type { BoatParams } from './types/boatParams';
import { DEFAULT_PARAMS, calculateMaxLength } from './types/boatParams';
import { ControlPanel } from './components/ControlPanel';
import { Viewer3D } from './components/Viewer3D';
import { calculateWaterlineHeight } from './utils/physics';
import { saveParamsToFile, loadParamsFromFile } from './utils/fileOperations';
import './App.css';

function App() {
  const [params, setParams] = useState<BoatParams>(DEFAULT_PARAMS);

  // Calculate derived values
  const maxLength = calculateMaxLength(params.buildPlateSize, params.beam);
  const calculatedLength = Math.min(maxLength, maxLength * 0.95); // Use 95% of max to leave margin
  const waterlineHeight = calculateWaterlineHeight(params, calculatedLength);

  const handleParamsChange = useCallback((newParams: BoatParams) => {
    setParams(newParams);
  }, []);

  const handleSave = useCallback(() => {
    saveParamsToFile(params);
  }, [params]);

  const handleLoad = useCallback(async () => {
    try {
      const loaded = await loadParamsFromFile();
      setParams(loaded);
    } catch (err) {
      // User cancelled or error
      console.log('Load cancelled or failed:', err);
    }
  }, []);

  const handleExportSTL = useCallback(() => {
    // Trigger export via a custom event
    // The Viewer3D component will handle the actual export
    const event = new CustomEvent('exportSTL');
    window.dispatchEvent(event);
  }, []);

  return (
    <div className="app">
      <ControlPanel
        params={params}
        onChange={handleParamsChange}
        onSave={handleSave}
        onLoad={handleLoad}
        onExportSTL={handleExportSTL}
        calculatedLength={calculatedLength}
        waterlineHeight={waterlineHeight}
      />
      <Viewer3D
        params={params}
        calculatedLength={calculatedLength}
        waterlineHeight={waterlineHeight}
      />
    </div>
  );
}

export default App;
