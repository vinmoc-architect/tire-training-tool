import { create } from 'zustand';
import type { ImageItem, SegmentationStatus } from '@/types/images';

type ImageStore = {
  images: ImageItem[];
  addImages: (files: File[]) => void;
  updateStatus: (id: string, status: SegmentationStatus, payload?: Partial<ImageItem>) => void;
  reset: () => void;
};

const toImageItem = (file: File): ImageItem => ({
  id: crypto.randomUUID(),
  name: file.name,
  file,
  size: file.size,
  previewUrl: URL.createObjectURL(file),
  status: 'idle'
});

export const useImageStore = create<ImageStore>((set) => ({
  images: [],
  addImages: (files) =>
    set((state) => ({
      images: [
        ...state.images,
        ...files.map((file) => toImageItem(file))
      ]
    })),
  updateStatus: (id, status, payload) =>
    set((state) => ({
      images: state.images.map((image) =>
        image.id === id
          ? {
              ...image,
              status,
              ...payload
            }
          : image
      )
    })),
  reset: () =>
    set((state) => {
      state.images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return { images: [] };
    })
}));
