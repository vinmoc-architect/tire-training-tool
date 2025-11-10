import type { MaskLabel } from './labels';

export type SegmentationStatus = 'idle' | 'processing' | 'complete' | 'error';

export interface ImageItem {
  id: string;
  name: string;
  file: File;
  size: number;
  previewUrl: string;
  status: SegmentationStatus;
  maskPreviewUrl?: string;
  savedMaskUrl?: string;
  savedLabel?: MaskLabel;
  savedFilePath?: string;
  errorMessage?: string;
}
