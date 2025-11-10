import type { ImageItem } from '@/types/images';

interface Props {
  images: ImageItem[];
  onOpenSegmentation: (image: ImageItem) => void;
  onRequestLabel: (image: ImageItem) => void;
}

const statusCopy: Record<ImageItem['status'], string> = {
  idle: 'In attesa',
  processing: 'Elaborazione…',
  complete: 'Completato',
  error: 'Errore'
};

export function ImageGrid({ images, onOpenSegmentation, onRequestLabel }: Props) {
  if (images.length === 0) {
    return <p>Nessuna immagine caricata.</p>;
  }

  return (
    <div className="image-grid">
      {images.map((image) => (
        <article key={image.id} className="image-card">
          <div className="image-card__preview">
            <img src={image.previewUrl} alt={image.name} loading="lazy" />
          </div>
          <strong>{image.name}</strong>
          <small>{(image.size / 1024).toFixed(1)} KB</small>
          <div className="image-card__actions">
            <button type="button" onClick={() => onOpenSegmentation(image)}>
              Apri editor
            </button>
            <span className="image-card__status">{statusCopy[image.status]}</span>
          </div>
          {image.maskPreviewUrl && (
            <div className="image-card__preview image-card__preview--mask">
              <img src={image.maskPreviewUrl} alt={`Segmentazione di ${image.name}`} loading="lazy" />
            </div>
          )}
          {image.errorMessage && (
            <small style={{ color: '#dc2626' }}>{image.errorMessage}</small>
          )}
          <div className="image-card__secondary-actions">
            <button type="button" onClick={() => onRequestLabel(image)} disabled={!image.maskPreviewUrl}>
              Salva risultato
            </button>
            {image.savedMaskUrl && (
              <div>
                <span className="image-card__saved">
                  Mask salvata{image.savedLabel ? ` (${image.savedLabel})` : ''}
                </span>
                {image.savedFilePath && (
                  <small className="image-card__path" title={image.savedFilePath}>
                    {image.savedFilePath}
                  </small>
                )}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
