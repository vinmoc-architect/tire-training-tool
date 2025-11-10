import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MASK_LABELS = ['OK', 'SHOULDER_IN', 'SHOULDER_OUT', 'BALS', 'UNEVEN'] as const;
export type MaskLabel = (typeof MASK_LABELS)[number];

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

export interface SaveMaskOptions {
  label: MaskLabel;
  imageId: string;
  maskBuffer: Buffer;
  rootDir: string;
}

export const saveMaskToLabelFolder = async ({ label, imageId, maskBuffer, rootDir }: SaveMaskOptions) => {
  if (!MASK_LABELS.includes(label)) {
    throw new Error(`Label non supportata: ${label}`);
  }
  if (!rootDir) {
    throw new Error('Root di salvataggio non configurata');
  }
  const root = path.resolve(rootDir);
  const labelDir = path.join(root, label);
  await ensureDir(labelDir);
  const filename = `${imageId}-${Date.now()}.png`;
  const filePath = path.join(labelDir, filename);
  await fs.writeFile(filePath, maskBuffer);
  return filePath;
};
