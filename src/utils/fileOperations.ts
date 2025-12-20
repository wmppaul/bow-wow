import type { BoatParams, SaveFile } from '../types/boatParams';
import { PARAMS_VERSION, loadParams } from '../types/boatParams';

/**
 * Save boat parameters to a JSON file
 */
export function saveParamsToFile(params: BoatParams): void {
  const saveData: SaveFile = {
    version: PARAMS_VERSION,
    params,
    savedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(saveData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `boat-design-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Load boat parameters from a JSON file
 */
export function loadParamsFromFile(): Promise<BoatParams> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text) as SaveFile;

        // Handle version migrations if needed
        if (data.version !== PARAMS_VERSION) {
          console.log(`Migrating from version ${data.version} to ${PARAMS_VERSION}`);
        }

        // Merge with defaults to handle missing params from older versions
        const params = loadParams(data.params);
        resolve(params);
      } catch (err) {
        reject(new Error('Failed to parse file: ' + (err as Error).message));
      }
    };

    input.oncancel = () => {
      reject(new Error('File selection cancelled'));
    };

    input.click();
  });
}
