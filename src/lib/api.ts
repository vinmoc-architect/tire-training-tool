import axios from 'axios';
import type { ImageItem } from '@/types/images';
import type { BoundaryPolygon, SegmentPoint } from '@/types/prompts';
import type { MaskLabel } from '@/types/labels';

export type SegmentAlgorithm = 'sam' | 'sam2';
export type SegmentModelSize = 'tiny' | 'small' | 'base' | 'large';
export type SegmentPromptType = 'point' | 'box';
export type SaveMaskPayload = {
  imageId: string;
  maskData: string;
  label: MaskLabel;
  rootDir: string;
};
export type GrayscaleMode = 'standard' | 'clahe' | 'adaptive' | 'gaussian';

export type SegmentRequest = {
  prompt?: string;
  points?: SegmentPoint[];
  boundary?: BoundaryPolygon;
  promptType: SegmentPromptType;
  algorithm: SegmentAlgorithm;
  modelSize: SegmentModelSize;
};

export type SegmentResponse = {
  maskUrl: string;
  meta?: Record<string, unknown>;
};

export const segmentImage = async (
  image: ImageItem,
  options: SegmentRequest,
  overrideFile?: File
): Promise<SegmentResponse> => {
  const formData = new FormData();
  const fileToSend = overrideFile ?? image.file;
  const filename = overrideFile?.name ?? image.name;
  formData.append('image', fileToSend, filename);
  if (options.prompt) {
    formData.append('prompt', options.prompt);
  }
  if (options.points?.length) {
    formData.append('points', JSON.stringify(options.points));
  }
  if (options.boundary) {
    formData.append('boundary', JSON.stringify(options.boundary));
  }
  formData.append('promptType', options.promptType);
  formData.append('algorithm', options.algorithm);
  formData.append('modelSize', options.modelSize);

  const { data } = await axios.post<SegmentResponse>('/api/segment', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return data;
};

export const saveMask = async ({ imageId, maskData, label, rootDir }: SaveMaskPayload) => {
  const { data } = await axios.post<{ path: string }>('/api/save-mask', {
    imageId,
    maskData,
    label,
    rootDir
  });
  return data;
};

export const applyGrayscale = async (imageData: string, mode: GrayscaleMode) => {
  const { data } = await axios.post<{ dataUrl: string }>('/api/preprocess/grayscale', {
    imageData,
    mode
  });
  return data;
};
