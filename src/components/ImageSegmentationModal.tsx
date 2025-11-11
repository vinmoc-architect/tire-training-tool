import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageItem } from '@/types/images';
import type { SegmentAlgorithm, SegmentModelSize, SegmentRequest, GrayscaleMode } from '@/lib/api';
import { applyGrayscale } from '@/lib/api';
import type { MaskLabel } from '@/types/labels';
import { MASK_LABELS } from '@/types/labels';
import { Modal } from './Modal';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = src;
  });

const dataUrlToFile = (dataUrl: string, filename: string): File => {
  const match = dataUrl.match(/^data:(.*?);base64,(.+)$/);
  if (!match) {
    throw new Error('Data URL non valida');
  }
  const mime = match[1] || 'image/png';
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return new File([bytes], filename, { type: mime });
};

type TransformOptions = {
  size: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
};

const transformImage = async (src: string, options: TransformOptions): Promise<string> => {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = options.size;
  canvas.height = options.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas non supportato');
  }
  ctx.save();
  ctx.translate(options.size / 2, options.size / 2);
  ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);
  ctx.rotate((options.rotation * Math.PI) / 180);
  ctx.drawImage(img, -options.size / 2, -options.size / 2, options.size, options.size);
  ctx.restore();
  return canvas.toDataURL('image/png');
};

const composeWithMask = async (baseSrc: string, maskSrc: string): Promise<string> => {
  const [baseImg, maskImg] = await Promise.all([loadImage(baseSrc), loadImage(maskSrc)]);
  const canvas = document.createElement('canvas');
  canvas.width = baseImg.width;
  canvas.height = baseImg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas non supportato');
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas.toDataURL('image/png');
};

type Mode = 'points' | 'boundary';

type BoundaryPoint = { x: number; y: number };

type CropRect = { x: number; y: number; width: number; height: number };

type WizardStep = 'preprocess' | 'annotate' | 'normalize' | 'grayscale' | 'review';
const GRAYSCALE_OPTIONS: Array<{ value: GrayscaleMode; label: string; description: string }> = [
  { value: 'standard', label: 'Standard', description: 'Conversione semplice BGR → Grayscale' },
  { value: 'clahe', label: 'CLAHE', description: 'Equalizzazione adattiva del contrasto' },
  { value: 'adaptive', label: 'Adaptive Threshold', description: 'Soglia locale per enfatizzare bordi' },
  { value: 'gaussian', label: 'Gaussian Blur', description: 'Grayscale + sfocatura dolce' }
];

interface Props {
  image: ImageItem;
  initialStep: WizardStep;
  rootDir: string;
  onClose: () => void;
  onSubmit: (image: ImageItem, payload: SegmentRequest, overrideFile?: File) => Promise<string | undefined>;
  onSaveResult: (image: ImageItem, label: MaskLabel, maskData?: string | null) => Promise<void>;
}

export function ImageSegmentationModal({ image, initialStep, rootDir, onClose, onSubmit, onSaveResult }: Props) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('points');
  const [pointLabel, setPointLabel] = useState<0 | 1>(1);
  const [points, setPoints] = useState<Array<{ x: number; y: number; label: 0 | 1 }>>([]);
  const [boundaryPoints, setBoundaryPoints] = useState<BoundaryPoint[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string>(image.previewUrl);
  const [overrideFile, setOverrideFile] = useState<File | null>(null);
  const [maskPreviewLocal, setMaskPreviewLocal] = useState<string | null>(image.maskPreviewUrl ?? null);
  const [finalMaskUrl, setFinalMaskUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [algorithm, setAlgorithm] = useState<SegmentAlgorithm>('sam2');
  const [modelSize, setModelSize] = useState<SegmentModelSize>('base');
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep);
  const [selectedLabel, setSelectedLabel] = useState<MaskLabel>(image.savedLabel ?? 'OK');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [normalizeSize, setNormalizeSize] = useState<'224' | '320'>('224');
  const [normalizeRotation, setNormalizeRotation] = useState<0 | 90 | 180 | 270>(0);
  const [normalizeFlipH, setNormalizeFlipH] = useState(false);
  const [normalizeFlipV, setNormalizeFlipV] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [grayscaleMode, setGrayscaleMode] = useState<GrayscaleMode>('standard');
  const [isApplyingGrayscale, setIsApplyingGrayscale] = useState(false);
  const [grayscaleError, setGrayscaleError] = useState<string | null>(null);
  const [hasAppliedGrayscale, setHasAppliedGrayscale] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(null);
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [stageMetrics, setStageMetrics] = useState<{
    displayWidth: number;
    displayHeight: number;
    offsetX: number;
    offsetY: number;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);
  const displaySrc = previewSrc || image.previewUrl;
  const maskOverlaySrc = maskPreviewLocal ?? image.maskPreviewUrl ?? null;

  useEffect(() => {
    console.log('[wizard] state snapshot', {
      imageId: image.id,
      currentStep,
      previewSrcLength: previewSrc?.length ?? 0,
      maskPreviewLocalLength: maskPreviewLocal?.length ?? 0,
      imageMaskLen: image.maskPreviewUrl?.length ?? 0
    });
  }, [currentStep, image.id, image.maskPreviewUrl, maskPreviewLocal, previewSrc]);

  const updateStageMetrics = useCallback(() => {
    if (!stageRef.current || !imageSize) {
      setStageMetrics(null);
      return;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const stageWidth = rect.width;
    const stageHeight = rect.height;
    if (stageWidth === 0 || stageHeight === 0) {
      setStageMetrics(null);
      return;
    }
    const imageRatio = imageSize.width / imageSize.height;
    const stageRatio = stageWidth / stageHeight;
    let displayWidth: number;
    let displayHeight: number;
    let offsetX = 0;
    let offsetY = 0;
    if (imageRatio > stageRatio) {
      displayWidth = stageWidth;
      displayHeight = stageWidth / imageRatio;
      offsetY = (stageHeight - displayHeight) / 2;
    } else {
      displayHeight = stageHeight;
      displayWidth = stageHeight * imageRatio;
      offsetX = (stageWidth - displayWidth) / 2;
    }
    setStageMetrics({
      displayWidth,
      displayHeight,
      offsetX,
      offsetY,
      stageWidth,
      stageHeight
    });
  }, [imageSize]);

  useEffect(() => {
    setPrompt(image.name);
    setMode('points');
    setPointLabel(1);
    setPoints([]);
    setBoundaryPoints([]);
    setError(null);
    setAlgorithm('sam2');
    setModelSize('base');
    setPreviewSrc(image.previewUrl);
    setOverrideFile(null);
    setCropRect(null);
    setDraftCrop(null);
    setSelectedLabel(image.savedLabel ?? 'OK');
    setSaveError(null);
    setIsSaving(false);
    setNormalizeSize('224');
    setNormalizeRotation(0);
    setNormalizeFlipH(false);
    setNormalizeFlipV(false);
    setNormalizeError(null);
    setIsNormalizing(false);
    setGrayscaleMode('standard');
    setGrayscaleError(null);
    setHasAppliedGrayscale(false);
    setIsApplyingGrayscale(false);
    setMaskPreviewLocal(image.maskPreviewUrl ?? null);
    setCurrentStep(initialStep ?? 'preprocess');
  }, [image.id, initialStep, image.name, image.previewUrl, image.savedLabel]);

  useEffect(() => {
    if (image.maskPreviewUrl) {
      setMaskPreviewLocal(image.maskPreviewUrl);
    }
  }, [image.maskPreviewUrl]);

  useEffect(() => {
    updateStageMetrics();
  }, [updateStageMetrics]);

  useEffect(() => {
    if (!stageRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => updateStageMetrics());
    observer.observe(stageRef.current);
    return () => {
      observer.disconnect();
    };
  }, [updateStageMetrics]);

  const addPoint = useCallback(
    (x: number, y: number) => {
      if (mode === 'points') {
        setPoints((prev) => [...prev, { x, y, label: pointLabel }]);
      } else {
        setBoundaryPoints((prev) => [...prev, { x, y }]);
      }
    },
    [mode, pointLabel]
  );

  const handleStageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (currentStep !== 'annotate') {
      return;
    }
    if (!stageRef.current || !imageSize || !stageMetrics) {
      return;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const rawX = event.clientX - rect.left - stageMetrics.offsetX;
    const rawY = event.clientY - rect.top - stageMetrics.offsetY;
    if (rawX < 0 || rawX > stageMetrics.displayWidth || rawY < 0 || rawY > stageMetrics.displayHeight) {
      return;
    }
    const relativeX = rawX / stageMetrics.displayWidth;
    const relativeY = rawY / stageMetrics.displayHeight;
    const x = Math.round(relativeX * imageSize.width);
    const y = Math.round(relativeY * imageSize.height);
    addPoint(x, y);
  };

  const resetAnnotations = () => {
    setPoints([]);
    setBoundaryPoints([]);
    setError(null);
  };

  const removeLastPoint = () => {
    if (mode === 'points') {
      setPoints((prev) => prev.slice(0, -1));
    } else {
      setBoundaryPoints((prev) => prev.slice(0, -1));
    }
  };

  const projectPoint = useCallback(
    (point: { x: number; y: number }) => {
      if (!imageSize || !stageMetrics) {
        return null;
      }
      const ratioX = point.x / imageSize.width;
      const ratioY = point.y / imageSize.height;
      const projectedX = stageMetrics.offsetX + ratioX * stageMetrics.displayWidth;
      const projectedY = stageMetrics.offsetY + ratioY * stageMetrics.displayHeight;
      return { x: projectedX, y: projectedY };
    },
    [imageSize, stageMetrics]
  );

  const annotationPreview = useMemo(() => {
    if (!imageSize || !stageMetrics) {
      return null;
    }

    if (mode === 'points') {
      return points.map((point, index) => {
        const projected = projectPoint(point);
        if (!projected) {
          return null;
        }
        return (
          <span
            key={`${point.x}-${point.y}-${index}`}
            className={`annotation-point annotation-point--${point.label === 1 ? 'fg' : 'bg'}`}
            style={{
              left: `${projected.x}px`,
              top: `${projected.y}px`
            }}
          />
        );
      });
    }

    if (boundaryPoints.length < 2) {
      return null;
    }

    const commands = boundaryPoints
      .map((point, index) => {
        const projected = projectPoint(point);
        if (!projected) {
          return '';
        }
        const prefix = index === 0 ? 'M' : 'L';
        return `${prefix}${projected.x},${projected.y}`;
      })
      .join(' ');
    const path = boundaryPoints.length > 2 ? `${commands} Z` : commands;

    return (
      <svg
        className="annotation-boundary"
        viewBox={`0 0 ${stageMetrics.stageWidth} ${stageMetrics.stageHeight}`}
        preserveAspectRatio="none"
      >
        <path d={`${path}`} />
      </svg>
    );
  }, [boundaryPoints, imageSize, mode, points, projectPoint, stageMetrics]);

  const cropOverlay = useMemo(() => {
    const rect = draftCrop ?? cropRect;
    if (!rect || !stageMetrics) {
      return null;
    }
    const topLeft = projectPoint({ x: rect.x, y: rect.y });
    const bottomRight = projectPoint({ x: rect.x + rect.width, y: rect.y + rect.height });
    if (!topLeft || !bottomRight) {
      return null;
    }
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }, [cropRect, draftCrop, projectPoint, stageMetrics]);

  const stageToImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!stageRef.current || !stageMetrics || !imageSize) {
        return null;
      }
      const rect = stageRef.current.getBoundingClientRect();
      const rawX = clientX - rect.left - stageMetrics.offsetX;
      const rawY = clientY - rect.top - stageMetrics.offsetY;
      if (rawX < 0 || rawY < 0 || rawX > stageMetrics.displayWidth || rawY > stageMetrics.displayHeight) {
        return null;
      }
      const ratioX = rawX / stageMetrics.displayWidth;
      const ratioY = rawY / stageMetrics.displayHeight;
      return {
        x: Math.max(0, Math.min(imageSize.width, ratioX * imageSize.width)),
        y: Math.max(0, Math.min(imageSize.height, ratioY * imageSize.height))
      };
    },
    [imageSize, stageMetrics]
  );

  const handleCropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (currentStep !== 'preprocess' || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const coords = stageToImageCoords(event.clientX, event.clientY);
    if (!coords) {
      return;
    }
    setIsDrawingCrop(true);
    setCropStart(coords);
    setDraftCrop({ x: coords.x, y: coords.y, width: 0, height: 0 });
  };

  const handleCropMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDrawingCrop || !cropStart) {
      return;
    }
    const coords = stageToImageCoords(event.clientX, event.clientY);
    if (!coords) {
      return;
    }
    const rect = {
      x: Math.min(cropStart.x, coords.x),
      y: Math.min(cropStart.y, coords.y),
      width: Math.abs(coords.x - cropStart.x),
      height: Math.abs(coords.y - cropStart.y)
    };
    setDraftCrop(rect);
  };

  const finalizeCropSelection = () => {
    if (!draftCrop || draftCrop.width < 5 || draftCrop.height < 5) {
      setCropRect(null);
    } else {
      setCropRect(draftCrop);
    }
    setIsDrawingCrop(false);
    setCropStart(null);
  };

  const handleCropMouseUp = () => {
    if (!isDrawingCrop) {
      return;
    }
    finalizeCropSelection();
  };

  const cropCurrentPreview = useCallback(
    async (src: string, rect: CropRect, baseName: string) => {
      const img = await loadImage(src);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width < 2 || height < 2) {
        throw new Error('Il crop selezionato è troppo piccolo');
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas non supportato');
      }
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new Error('Impossibile generare il crop');
      }
      const file = new File([blob], `crop-${baseName}.png`, { type: 'image/png' });
      return { dataUrl, file };
    },
    []
  );

  const handleApplyCrop = useCallback(async () => {
    if (!cropRect || !displaySrc) {
      setError('Seleziona un box di crop valido.');
      return;
    }
    try {
      console.log('[wizard] applying crop', {
        imageId: image.id,
        rect: cropRect,
        displaySrcLength: displaySrc?.length ?? 0
      });
      const cropped = await cropCurrentPreview(displaySrc, cropRect, image.name);
      setPreviewSrc(cropped.dataUrl);
      setOverrideFile(cropped.file);
      setPoints([]);
      setBoundaryPoints([]);
      setCropRect(null);
      setDraftCrop(null);
      setError(null);
      setCurrentStep('annotate');
    } catch (cropError) {
      const message = cropError instanceof Error ? cropError.message : 'Errore durante il crop';
      setError(message);
    }
  }, [cropCurrentPreview, cropRect, displaySrc, image.name]);

  const handleApplyNormalize = useCallback(async () => {
    if (!maskPreviewLocal) {
      setNormalizeError('Completa la segmentazione prima di normalizzare.');
      setCurrentStep('annotate');
      return;
    }
    try {
      setIsNormalizing(true);
      setNormalizeError(null);
      const options: TransformOptions = {
        size: Number(normalizeSize),
        rotation: normalizeRotation,
        flipH: normalizeFlipH,
        flipV: normalizeFlipV
      };
      const [normalizedBase, normalizedMask] = await Promise.all([
        transformImage(previewSrc, options),
        transformImage(maskPreviewLocal, options)
      ]);
      setPreviewSrc(normalizedBase);
      setMaskPreviewLocal(normalizedMask);
      setCurrentStep('grayscale');
      console.log('[wizard] normalize applied', {
        imageId: image.id,
        ...options,
        baseLen: normalizedBase.length,
        maskLen: normalizedMask.length
      });
    } catch (normalizeErr) {
      const message = normalizeErr instanceof Error ? normalizeErr.message : 'Errore durante la normalizzazione';
      setNormalizeError(message);
    } finally {
      setIsNormalizing(false);
    }
  }, [image.id, maskPreviewLocal, normalizeFlipH, normalizeFlipV, normalizeRotation, normalizeSize, previewSrc]);

  const handleApplyGrayscale = useCallback(async () => {
    if (!displaySrc) {
      setGrayscaleError('Nessuna immagine disponibile per il processing.');
      return;
    }
    try {
      setIsApplyingGrayscale(true);
      setGrayscaleError(null);
      console.log('[wizard] applying grayscale', {
        imageId: image.id,
        mode: grayscaleMode,
        displaySrcLength: displaySrc?.length ?? 0
      });
      const { dataUrl } = await applyGrayscale(displaySrc, grayscaleMode);
      const file = dataUrlToFile(dataUrl, `grayscale-${image.name}.png`);
      setPreviewSrc(dataUrl);
      setOverrideFile(file);
      setHasAppliedGrayscale(true);
      setMaskPreviewLocal(dataUrl);
      setPoints([]);
      setBoundaryPoints([]);
      setCurrentStep('review');
    } catch (grayscaleErr) {
      const message =
        grayscaleErr instanceof Error ? grayscaleErr.message : 'Errore durante la conversione grayscale';
      setGrayscaleError(message);
    } finally {
      setIsApplyingGrayscale(false);
    }
  }, [displaySrc, grayscaleMode, image.name]);

  const handleSubmit = async () => {
    const payload: SegmentRequest = {
      prompt,
      promptType: mode === 'points' ? 'point' : 'box',
      algorithm,
      modelSize
    };
    if (mode === 'points') {
      if (!points.length) {
        setError('Aggiungi almeno un punto (foreground/background)');
        return;
      }
      payload.points = points;
    } else {
      if (boundaryPoints.length < 3) {
        setError('La boundary richiede almeno tre vertici');
        return;
      }
      payload.boundary = { points: boundaryPoints };
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const maskUrl = await onSubmit(image, payload, overrideFile ?? undefined);
      console.log('[wizard] segmentation done', {
        imageId: image.id,
        maskLength: maskUrl?.length ?? 0,
        overrideUsed: Boolean(overrideFile)
      });
      if (maskUrl) {
        setMaskPreviewLocal(maskUrl);
        setPreviewSrc(maskUrl);
      }
      setCurrentStep('normalize');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Errore durante la segmentazione';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveMask = async () => {
    const maskData = maskPreviewLocal ?? image.maskPreviewUrl;
    if (!maskData) {
      setSaveError('Esegui la segmentazione o applica il filtro prima di salvare.');
      setCurrentStep('annotate');
      return;
    }
    try {
      setIsSaving(true);
      setSaveError(null);
      await onSaveResult(image, selectedLabel, maskData);
      onClose();
    } catch (saveErr) {
      const message = saveErr instanceof Error ? saveErr.message : 'Errore durante il salvataggio';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const goToStep = (step: WizardStep) => {
    // Normalizza e step successivi richiedono una mask (maskPreviewLocal)
    if ((step === 'normalize' || step === 'grayscale' || step === 'review') && !maskPreviewLocal) {
      setError('Completa la segmentazione prima di passare allo step successivo');
      return;
    }
    setCurrentStep(step);
  };

  const resetCropSelection = () => {
    setPreviewSrc(image.previewUrl);
    setOverrideFile(null);
    setCropRect(null);
    setDraftCrop(null);
    setError(null);
    setCurrentStep('preprocess');
  };

  return (
    <Modal title={`Segmentazione: ${image.name}`} onClose={onClose}>
      <div className="wizard-nav">
        <button
          type="button"
          className={currentStep === 'preprocess' ? 'active' : ''}
          onClick={() => goToStep('preprocess')}
        >
          1. Crop
        </button>
        <button
          type="button"
          className={currentStep === 'annotate' ? 'active' : ''}
          onClick={() => goToStep('annotate')}
        >
          2. Segmenta
        </button>
        <button
          type="button"
          className={currentStep === 'normalize' ? 'active' : ''}
          onClick={() => goToStep('normalize')}
          disabled={!(maskPreviewLocal ?? image.maskPreviewUrl)}
        >
          3. Normalizza
        </button>
        <button
          type="button"
          className={currentStep === 'grayscale' ? 'active' : ''}
          onClick={() => goToStep('grayscale')}
          disabled={!(maskPreviewLocal ?? image.maskPreviewUrl)}
        >
          4. Grayscale
        </button>
        <button
          type="button"
          className={currentStep === 'review' ? 'active' : ''}
          onClick={() => goToStep('review')}
          disabled={!(maskPreviewLocal ?? image.maskPreviewUrl)}
        >
          5. Review & Salva
        </button>
      </div>
      <div className="segmentation-modal">
        <div
          className={`segmentation-modal__stage ${
            currentStep === 'annotate'
              ? ''
              : currentStep === 'preprocess'
              ? 'segmentation-modal__stage--preprocess'
              : 'segmentation-modal__stage--disabled'
          }`}
          ref={stageRef}
          onClick={currentStep === 'annotate' ? handleStageClick : undefined}
          onMouseDown={currentStep === 'preprocess' ? handleCropMouseDown : undefined}
          onMouseMove={currentStep === 'preprocess' ? handleCropMouseMove : undefined}
          onMouseUp={currentStep === 'preprocess' ? handleCropMouseUp : undefined}
          onMouseLeave={currentStep === 'preprocess' ? handleCropMouseUp : undefined}
        >
          <img
            className="segmentation-modal__stage-image"
            src={displaySrc}
            alt={image.name}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onLoad={(event) =>
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight
              })
            }
          />
          {maskOverlaySrc && (
            <img className="segmentation-modal__stage-mask" src={maskOverlaySrc} alt="Mask overlay" />
          )}
          {currentStep === 'annotate' && annotationPreview}
          {currentStep === 'preprocess' && cropOverlay && (
            <span
              className="crop-rect"
              style={{
                left: `${cropOverlay.left}px`,
                top: `${cropOverlay.top}px`,
                width: `${cropOverlay.width}px`,
                height: `${cropOverlay.height}px`
              }}
            />
          )}
          <div className="segmentation-modal__hint">
            {currentStep === 'annotate'
              ? 'Clicca per aggiungere punti/poligoni'
              : currentStep === 'preprocess'
              ? 'Trascina per selezionare il crop'
              : currentStep === 'normalize'
              ? 'Applica resize/rotate/flip oppure salta lo step'
              : currentStep === 'grayscale'
              ? 'Applica il filtro desiderato oppure salta lo step'
              : 'Torna agli step precedenti per modificare la segmentazione'}
          </div>
        </div>

        <div className="segmentation-modal__panel">
          {currentStep === 'preprocess' ? (
            <>
              <p>Seleziona l'area da ritagliare sull'immagine. Trascina per disegnare un box.</p>
              <div className="segmentation-actions">
                <button type="button" onClick={resetCropSelection}>
                  Reset crop
                </button>
                <button type="button" onClick={() => setCropRect(null)}>
                  Annulla selezione
                </button>
              </div>
              <div className="segmentation-submit">
                <button type="button" onClick={() => setCurrentStep('annotate')}>
                  Salta cropping
                </button>
                <button type="button" onClick={handleApplyCrop} disabled={!cropRect}>
                  Applica crop
                </button>
              </div>
              {error && <small style={{ color: '#dc2626' }}>{error}</small>}
            </>
          ) : currentStep === 'normalize' ? (
            <>
              <p>Ridimensiona l'immagine segmentata e applica rotazioni o flip se necessario.</p>
              <label className="segmentation-field">
                Dimensione finale
                <select value={normalizeSize} onChange={(event) => setNormalizeSize(event.target.value as '224' | '320')}>
                  <option value="224">224 x 224</option>
                  <option value="320">320 x 320</option>
                </select>
              </label>
              <div className="segmentation-actions" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setNormalizeRotation(((normalizeRotation + 270) % 360) as 0 | 90 | 180 | 270)}>
                  Ruota -90°
                </button>
                <button type="button" onClick={() => setNormalizeRotation(((normalizeRotation + 90) % 360) as 0 | 90 | 180 | 270)}>
                  Ruota +90°
                </button>
                <span>Rotazione corrente: {normalizeRotation}°</span>
              </div>
              <div className="segmentation-toggle" style={{ marginBottom: '0.75rem' }}>
                <button type="button" className={normalizeFlipH ? 'active' : ''} onClick={() => setNormalizeFlipH((prev) => !prev)}>
                  Flip orizzontale
                </button>
                <button type="button" className={normalizeFlipV ? 'active' : ''} onClick={() => setNormalizeFlipV((prev) => !prev)}>
                  Flip verticale
                </button>
              </div>
              {normalizeError && <small style={{ color: '#dc2626' }}>{normalizeError}</small>}
              <div className="segmentation-submit">
                <button type="button" onClick={() => setCurrentStep('grayscale')}>
                  Salta normalizzazione
                </button>
                <button type="button" onClick={handleApplyNormalize} disabled={isNormalizing || !(maskPreviewLocal ?? image.maskPreviewUrl)}>
                  {isNormalizing ? 'Elaborazione…' : 'Applica normalizzazione'}
                </button>
              </div>
            </>
          ) : currentStep === 'annotate' ? (
            <>
              <label className="segmentation-field">
                Prompt/testo (opzionale)
                <input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </label>

              <div className="segmentation-field">
                <span>Algoritmo</span>
                <div className="segmentation-toggle segmentation-toggle--dual">
                  <button
                    type="button"
                    className={algorithm === 'sam2' ? 'active' : ''}
                    onClick={() => setAlgorithm('sam2')}
                  >
                    SAM2
                  </button>
                  <button
                    type="button"
                    className={algorithm === 'sam' ? 'active' : ''}
                    onClick={() => setAlgorithm('sam')}
                  >
                    SAM
                  </button>
                </div>
              </div>

              <label className="segmentation-field">
                Dimensione modello
                <select value={modelSize} onChange={(event) => setModelSize(event.target.value as SegmentModelSize)}>
                  <option value="tiny">Tiny</option>
                  <option value="small">Small</option>
                  <option value="base">Base</option>
                  <option value="large">Large</option>
                </select>
              </label>

              <div className="segmentation-field">
                <span>Modalità</span>
                <div className="segmentation-toggle">
                  <button
                    type="button"
                    className={mode === 'points' ? 'active' : ''}
                    onClick={() => setMode('points')}
                  >
                    Points
                  </button>
                  <button
                    type="button"
                    className={mode === 'boundary' ? 'active' : ''}
                    onClick={() => setMode('boundary')}
                  >
                    Boundary
                  </button>
                </div>
              </div>

              {mode === 'points' && (
                <div className="segmentation-field">
                  <span>Label punto</span>
                  <div className="segmentation-toggle">
                    <button
                      type="button"
                      className={pointLabel === 1 ? 'active' : ''}
                      onClick={() => setPointLabel(1)}
                    >
                      Foreground
                    </button>
                    <button
                      type="button"
                      className={pointLabel === 0 ? 'active' : ''}
                      onClick={() => setPointLabel(0)}
                    >
                      Background
                    </button>
                  </div>
                </div>
              )}

              <div className="segmentation-actions">
                <button type="button" onClick={resetAnnotations}>
                  Reset annotazioni
                </button>
                <button type="button" onClick={removeLastPoint} disabled={mode === 'points' ? points.length === 0 : boundaryPoints.length === 0}>
                  Annulla ultimo
                </button>
              </div>

              {error && <small style={{ color: '#dc2626' }}>{error}</small>}

              <div className="segmentation-submit">
                <button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Elaborazione…' : `Applica ${algorithm.toUpperCase()}`}
                </button>
              </div>
            </>
          ) : currentStep === 'grayscale' ? (
            <>
              <p>Scegli la modalità di conversione in scala di grigi (OpenCV).</p>
              <label className="segmentation-field">
                Metodo
                <select value={grayscaleMode} onChange={(event) => setGrayscaleMode(event.target.value as GrayscaleMode)}>
                  {GRAYSCALE_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <small style={{ color: '#475569' }}>
                {GRAYSCALE_OPTIONS.find((option) => option.value === grayscaleMode)?.description}
              </small>
              {hasAppliedGrayscale && (
                <small style={{ color: '#16a34a' }}>
                  Ultimo filtro applicato: {GRAYSCALE_OPTIONS.find((option) => option.value === grayscaleMode)?.label ?? grayscaleMode}
                </small>
              )}
              {grayscaleError && <small style={{ color: '#dc2626' }}>{grayscaleError}</small>}
              <div className="segmentation-submit">
                <button type="button" onClick={() => setCurrentStep('review')}>
                  Salta grayscale
                </button>
                <button type="button" onClick={handleApplyGrayscale} disabled={isApplyingGrayscale}>
                  {isApplyingGrayscale ? 'Elaborazione…' : 'Applica grayscale'}
                </button>
              </div>
            </>
          ) : (
            <div className="label-modal">
              <div className="label-modal__preview">
                {maskPreviewLocal ?? image.maskPreviewUrl ? (
                  <img src={maskPreviewLocal ?? image.maskPreviewUrl ?? ''} alt="Mask seg" />
                ) : (
                  <p>Nessun output disponibile. Torna allo step precedente.</p>
                )}
              </div>
              <div className="label-modal__form">
                <label>
                  Label
                  <select value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value as MaskLabel)}>
                    {MASK_LABELS.map((label) => (
                      <option value={label} key={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <small style={{ color: rootDir ? '#16a34a' : '#dc2626' }}>
                  Root di salvataggio: {rootDir || 'non configurata'}
                </small>
                {saveError && <small style={{ color: '#dc2626' }}>{saveError}</small>}
                <div className="label-modal__actions">
                  <button type="button" onClick={() => setCurrentStep('annotate')}>
                    Torna indietro
                  </button>
                  <button type="button" onClick={handleSaveMask} disabled={!image.maskPreviewUrl || isSaving || !rootDir}>
                    {isSaving ? 'Salvataggio…' : 'Salva risultato'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
