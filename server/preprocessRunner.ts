import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.join(__dirname, 'run_preprocess.py');

const resolvePythonBin = () => process.env.SEGMENTATION_PYTHON_PATH ?? 'python3';

export type GrayscaleMode = 'standard' | 'clahe' | 'adaptive' | 'gaussian';

const runProcess = (command: string, args: string[], cwd?: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `Preprocess runner exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

export const runGrayscaleProcessing = async (buffer: Buffer, mode: GrayscaleMode): Promise<Buffer> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preprocess-'));
  const inputPath = path.join(tempDir, `input-${randomUUID()}.png`);
  const outputPath = path.join(tempDir, `output-${randomUUID()}.png`);
  try {
    await fs.writeFile(inputPath, buffer);
    const args = [
      SCRIPT_PATH,
      '--image',
      inputPath,
      '--output',
      outputPath,
      '--mode',
      mode
    ];
    await runProcess(resolvePythonBin(), args, path.dirname(SCRIPT_PATH));
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
