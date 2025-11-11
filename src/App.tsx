import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { ImageGrid } from './components/ImageGrid';
import { ImageSegmentationModal } from './components/ImageSegmentationModal';
import { useImageStore } from './hooks/useImageStore';
import { segmentImage, saveMask } from './lib/api';
import type { ImageItem } from './types/images';
import type { MaskLabel } from './types/labels';

function App() {
  const { images, addImages, updateStatus, reset } = useImageStore();
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<'preprocess' | 'grayscale' | 'annotate' | 'review'>('preprocess');
  const [rootDir, setRootDir] = useState('');
  const [rootInput, setRootInput] = useState('');
  const [rootError, setRootError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('tire-tool-rootDir');
    if (stored) {
      setRootDir(stored);
      setRootInput(stored);
    }
  }, []);

  const handleRootSave = () => {
    const trimmed = rootInput.trim();
    if (!trimmed) {
      setRootError('Inserisci una cartella valida');
      return;
    }
    setRootDir(trimmed);
    setRootError(null);
    localStorage.setItem('tire-tool-rootDir', trimmed);
  };

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      addImages(files);
    },
    [addImages]
  );

  const handleProcessImage = useCallback(
    async (image: ImageItem, payload: Parameters<typeof segmentImage>[1], overrideFile?: File) => {
      updateStatus(image.id, 'processing', { savedMaskUrl: undefined, maskPreviewUrl: undefined, errorMessage: undefined });
      try {
        const response = await segmentImage(image, payload, overrideFile);
        console.log('[segmentImage] completed', {
          imageId: image.id,
          hasOverride: Boolean(overrideFile),
          maskLength: response.maskUrl?.length ?? 0
        });
        updateStatus(image.id, 'complete', { maskPreviewUrl: response.maskUrl, errorMessage: undefined });
        return response.maskUrl;
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Errore durante la segmentazione';
        updateStatus(image.id, 'error', {
          errorMessage: message
        });
        throw new Error(message);
      }
    },
    [updateStatus]
  );

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId),
    [images, selectedImageId]
  );

  const handleOpenSegmentation = useCallback((image: ImageItem) => {
    setSelectedImageId(image.id);
    setModalStep('preprocess');
  }, []);

  const handleRequestLabel = useCallback(
    (image: ImageItem) => {
      if (!rootDir) {
        updateStatus(image.id, 'error', { errorMessage: 'Configura la cartella root prima di salvare.' });
        return;
      }
      if (!image.maskPreviewUrl) {
        updateStatus(image.id, 'error', { errorMessage: 'Nessun risultato di segmentazione da salvare.' });
        return;
      }
      setSelectedImageId(image.id);
      setModalStep('review');
    },
    [rootDir, updateStatus]
  );

  const handleSaveMask = useCallback(
    async (image: ImageItem, label: MaskLabel, maskDataOverride?: string | null) => {
      if (!rootDir) {
        throw new Error('Configura la cartella root nella home prima di salvare.');
      }
      const maskData = maskDataOverride ?? image.maskPreviewUrl;
      if (!maskData) {
        throw new Error('Esegui la segmentazione (o applica grayscale) prima di salvare.');
      }
      const { path } = await saveMask({
        imageId: image.id,
        maskData,
        label,
        rootDir
      });
      updateStatus(image.id, image.status, {
        savedMaskUrl: maskData,
        savedLabel: label,
        savedFilePath: path,
        errorMessage: undefined
      });
    },
    [rootDir, updateStatus]
  );

  return (
    <div className="layout">
      <header style={{ marginBottom: '2rem' }}>
        <h1>Strumento SAM2 per dataset pneumatici</h1>
        <p>Carica una cartella di immagini e applica la segmentazione per ogni elemento.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} disabled={!images.length}>
            Svuota lista
          </button>
        </div>
      </header>

      <section className="panel" style={{ marginBottom: '2rem' }}>
        <h2>Cartella di salvataggio</h2>
        <p>Le mask verranno salvate all&apos;interno di questa root, suddivise per label.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            style={{ flex: '1 1 280px' }}
            placeholder="/percorso/cartella"
            value={rootInput}
            onChange={(event) => setRootInput(event.target.value)}
          />
          <button type="button" onClick={handleRootSave}>
            Imposta root
          </button>
        </div>
        {rootDir && (
          <small style={{ color: '#16a34a' }}>Root corrente: {rootDir}</small>
        )}
        {rootError && <small style={{ color: '#dc2626' }}>{rootError}</small>}
      </section>

      <section className="panel" style={{ marginBottom: '2rem' }}>
        <ImageUploader onFilesSelected={handleFilesSelected} />
      </section>

      <section className="panel">
        <ImageGrid
          images={images}
          onOpenSegmentation={handleOpenSegmentation}
          onRequestLabel={handleRequestLabel}
        />
      </section>

      {selectedImage && (
        <ImageSegmentationModal
          image={selectedImage}
          initialStep={modalStep}
          rootDir={rootDir}
          onClose={() => setSelectedImageId(null)}
          onSubmit={handleProcessImage}
          onSaveResult={handleSaveMask}
        />
      )}
    </div>
  );
}

export default App;
