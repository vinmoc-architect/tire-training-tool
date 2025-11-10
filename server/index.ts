import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { parseSegmentPrompts } from './prompts';
import type { BoundaryPrompt } from './prompts';
import {
  runSegmentation,
  type SegmentationAlgorithm,
  type SegmentationModelSize,
  type SegmentationPromptType
} from './segmentationRunner';
import { runGrayscaleProcessing, type GrayscaleMode } from './preprocessRunner';
import { saveMaskToLabelFolder, type MaskLabel, MASK_LABELS } from './saveMask';

const app = express();
const port = process.env.PORT ?? 4000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));

const DEFAULT_ALGORITHM: SegmentationAlgorithm =
  (process.env.SEGMENTATION_DEFAULT_ALGORITHM as SegmentationAlgorithm) ?? 'sam2';
const DEFAULT_MODEL_SIZE: SegmentationModelSize =
  (process.env.SEGMENTATION_DEFAULT_MODEL_SIZE as SegmentationModelSize) ?? 'base';

const validAlgorithms: SegmentationAlgorithm[] = ['sam', 'sam2'];
const validSizes: SegmentationModelSize[] = ['tiny', 'small', 'base', 'large'];

const toStringField = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0] as string;
  }
  return undefined;
};

const resolveAlgorithm = (value: unknown): SegmentationAlgorithm => {
  const raw = toStringField(value);
  if (raw && validAlgorithms.includes(raw as SegmentationAlgorithm)) {
    return raw as SegmentationAlgorithm;
  }
  return DEFAULT_ALGORITHM;
};

const resolveModelSize = (value: unknown): SegmentationModelSize => {
  const raw = toStringField(value);
  if (raw && validSizes.includes(raw as SegmentationModelSize)) {
    return raw as SegmentationModelSize;
  }
  return DEFAULT_MODEL_SIZE;
};

const boundaryToBbox = (boundary?: BoundaryPrompt): [number, number, number, number] | undefined => {
  if (!boundary?.points?.length) {
    return undefined;
  }
  const xs = boundary.points.map((point) => point.x);
  const ys = boundary.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX, maxY];
};

const dataUrlToBuffer = (dataUrl: string): Buffer => {
  const match = dataUrl.match(/^data:(.*?);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato immagine non valido (atteso data URL base64).');
  }
  return Buffer.from(match[2], 'base64');
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/segment', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nessuna immagine fornita' });
  }

  let prompts;
  try {
    prompts = parseSegmentPrompts(req.body as Record<string, string | string[] | undefined>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parametri SAM non validi';
    return res.status(400).json({ message });
  }

  const algorithm = resolveAlgorithm(req.body?.algorithm);
  const modelSize = resolveModelSize(req.body?.modelSize);
  const promptType: SegmentationPromptType = prompts.boundary ? 'box' : 'point';
  const bbox = promptType === 'box' ? boundaryToBbox(prompts.boundary) : undefined;

  const pointsPayload = promptType === 'point'
    ? prompts.points?.map((point) => ({ x: point.x, y: point.y, label: point.label }))
    : undefined;

  if (promptType === 'point' && (!pointsPayload || pointsPayload.length === 0)) {
    return res.status(400).json({ message: 'Aggiungi almeno un punto prima di eseguire la segmentazione.' });
  }

  if (promptType === 'box' && !bbox) {
    return res.status(400).json({ message: 'Boundary non valida: impossibile calcolare il bounding box.' });
  }

  try {
    const maskBuffer = await runSegmentation({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      algorithm,
      modelSize,
      promptType,
      points: pointsPayload,
      ...(bbox ? { bbox } : {})
    });

    const maskUrl = `data:image/png;base64,${maskBuffer.toString('base64')}`;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : null;

  return res.json({
    maskUrl,
    meta: {
      size: req.file.size,
      prompt,
        points: prompts.points?.length ?? 0,
        boundary: Boolean(prompts.boundary),
        algorithm,
        modelSize,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Segmentation error', error);
    const message = error instanceof Error ? error.message : 'Errore interno di segmentazione';
    return res.status(500).json({ message });
  }
});

app.post('/api/preprocess/grayscale', async (req, res) => {
  const imageData = toStringField(req.body?.imageData);
  const mode = (toStringField(req.body?.mode) as GrayscaleMode) ?? 'standard';

  if (!imageData) {
    return res.status(400).json({ message: 'imageData mancante' });
  }

  try {
    const buffer = dataUrlToBuffer(imageData);
    const processed = await runGrayscaleProcessing(buffer, mode);
    const dataUrl = `data:image/png;base64,${processed.toString('base64')}`;
    return res.json({ dataUrl });
  } catch (error) {
    console.error('Grayscale error', error);
    const message = error instanceof Error ? error.message : 'Errore nel preprocessing';
    return res.status(500).json({ message });
  }
});

app.post('/api/save-mask', async (req, res) => {
  const imageId = toStringField(req.body?.imageId);
  const labelRaw = toStringField(req.body?.label);
  const maskData = toStringField(req.body?.maskData);
  const rootDir = toStringField(req.body?.rootDir);

  if (!imageId) {
    return res.status(400).json({ message: 'imageId mancante' });
  }
  if (!labelRaw || !MASK_LABELS.includes(labelRaw as MaskLabel)) {
    return res.status(400).json({ message: 'Label non valida' });
  }
  if (!maskData) {
    return res.status(400).json({ message: 'maskData mancante' });
  }
  if (!rootDir) {
    return res.status(400).json({ message: 'rootDir mancante' });
  }

  let buffer: Buffer;
  try {
    buffer = dataUrlToBuffer(maskData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Formato mask non valido';
    return res.status(400).json({ message });
  }

  try {
    const filePath = await saveMaskToLabelFolder({
      label: labelRaw as MaskLabel,
      imageId,
      maskBuffer: buffer,
      rootDir
    });
    return res.json({ path: filePath });
  } catch (error) {
    console.error('Save mask error', error);
    const message = error instanceof Error ? error.message : 'Errore durante il salvataggio';
    return res.status(500).json({ message });
  }
});

app.listen(port, () => {
  console.log(`API ready on http://localhost:${port}`);
});
