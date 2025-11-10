export type PromptPoint = {
  x: number;
  y: number;
  label: 0 | 1; // 1 = foreground, 0 = background
};

export type BoundaryPrompt = {
  points: Array<{ x: number; y: number }>;
};

export type SegmentPrompts = {
  points?: PromptPoint[];
  boundary?: BoundaryPrompt;
};

type RawField = string | string[] | undefined;

const parseJsonField = <T>(field: RawField): T | undefined => {
  if (!field) {
    return undefined;
  }
  const value = Array.isArray(field) ? field[0] : field;
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error('Formato JSON non valido per i parametri SAM2');
  }
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const validatePoint = (point: Record<string, unknown>): PromptPoint => {
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    throw new Error('Ogni punto deve avere coordinate numeriche x/y');
  }
  const label = point.label;
  if (label !== 0 && label !== 1) {
    throw new Error('Ogni punto deve avere label 0 (background) o 1 (foreground)');
  }
  return { x: point.x, y: point.y, label };
};

const validateBoundary = (boundary: Record<string, unknown>): BoundaryPrompt => {
  const maybePoints = boundary.points;
  if (!Array.isArray(maybePoints) || maybePoints.length < 2) {
    throw new Error('La boundary deve contenere almeno due punti');
  }
  const points = maybePoints.map((point) => {
    if (typeof point !== 'object' || point === null) {
      throw new Error('Punti boundary non validi');
    }
    const typed = point as Record<string, unknown>;
    if (!isFiniteNumber(typed.x) || !isFiniteNumber(typed.y)) {
      throw new Error('Ogni punto boundary deve avere coordinate numeriche');
    }
    return { x: typed.x, y: typed.y };
  });
  return { points };
};

export const parseSegmentPrompts = (body: Record<string, RawField>): SegmentPrompts => {
  const parsedPoints = parseJsonField<unknown>(body.points);
  const parsedBoundary = parseJsonField<unknown>(body.boundary ?? body.polygon ?? body.box);

  const prompts: SegmentPrompts = {};

  if (parsedPoints) {
    if (!Array.isArray(parsedPoints)) {
      throw new Error('Il campo points deve essere una lista di punti');
    }
    prompts.points = parsedPoints.map((point) => {
      if (typeof point !== 'object' || point === null) {
        throw new Error('Formato punto non valido');
      }
      return validatePoint(point as Record<string, unknown>);
    });
  }

  if (parsedBoundary) {
    if (typeof parsedBoundary !== 'object' || parsedBoundary === null) {
      throw new Error('Il campo boundary deve essere un oggetto');
    }
    prompts.boundary = validateBoundary(parsedBoundary as Record<string, unknown>);
  }

  if (!prompts.points && !prompts.boundary) {
    throw new Error('Fornire almeno un punto o una boundary per la segmentazione');
  }

  return prompts;
};
