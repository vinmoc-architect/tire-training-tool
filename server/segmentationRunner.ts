import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.join(__dirname, 'run_segmentation.py');

const resolvePythonBin = () => process.env.SEGMENTATION_PYTHON_PATH ?? 'python3';

export type SegmentationAlgorithm = 'sam' | 'sam2';
export type SegmentationPromptType = 'point' | 'box';
export type SegmentationModelSize = 'tiny' | 'small' | 'base' | 'large';

export interface SegmentationRunnerOptions {
  imageBuffer: Buffer;
  mimeType: string;
  algorithm: SegmentationAlgorithm;
  modelSize: SegmentationModelSize;
  promptType: SegmentationPromptType;
  points?: Array<{ x: number; y: number; label: number }>;
  bbox?: [number, number, number, number];
}

const runProcess = (command: string, args: string[], cwd?: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `Segmentation runner exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

export const runSegmentation = async (options: SegmentationRunnerOptions): Promise<Buffer> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'segmentation-'));
  const ext = options.mimeType === 'image/png' ? 'png' : 'jpg';
  const inputPath = path.join(tempDir, `input-${randomUUID()}.${ext}`);
  const outputPath = path.join(tempDir, `mask-${randomUUID()}.png`);

  try {
    await fs.writeFile(inputPath, options.imageBuffer);

    const pointsPayload = options.points
      ? Buffer.from(
          JSON.stringify(options.points.map((point) => [point.x, point.y])),
          'utf8'
        ).toString('base64')
      : undefined;

    const labelsPayload = options.points
      ? Buffer.from(JSON.stringify(options.points.map((point) => point.label)), 'utf8').toString('base64')
      : undefined;

    const bboxPayload = options.bbox ? Buffer.from(JSON.stringify(options.bbox), 'utf8').toString('base64') : undefined;

    const args = [
      SCRIPT_PATH,
      '--image',
      inputPath,
      '--output',
      outputPath,
      '--algorithm',
      options.algorithm,
      '--model-size',
      options.modelSize,
      '--prompt-type',
      options.promptType
    ];

    if (pointsPayload) {
      args.push('--points-b64', pointsPayload);
    }
    if (labelsPayload) {
      args.push('--labels-b64', labelsPayload);
    }
    if (bboxPayload) {
      args.push('--bbox-b64', bboxPayload);
    }

    await runProcess(resolvePythonBin(), args, path.dirname(SCRIPT_PATH));

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
