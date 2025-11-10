import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  onFilesSelected: (files: File[]) => void;
};

const dragActive = (event: React.DragEvent<HTMLDivElement>) => {
  event.preventDefault();
  event.stopPropagation();
};

export function ImageUploader({ onFilesSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('mozdirectory', '');
  }, []);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }
      const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
      if (files.length) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    dragActive(event);
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleBrowseClick = () => inputRef.current?.click();

  return (
    <div
      onDragEnter={(event) => {
        dragActive(event);
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        dragActive(event);
        setIsDragging(false);
      }}
      onDragOver={dragActive}
      onDrop={handleDrop}
      className={`uploader ${isDragging ? 'uploader--dragging' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => handleFiles(event.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(event) => handleFiles(event.target.files)}
      />
      <p>Trascina qui le immagini oppure</p>
      <div className="uploader__actions">
        <button type="button" onClick={handleBrowseClick}>
          Scegli file
        </button>
        <button type="button" onClick={() => folderInputRef.current?.click()}>
          Importa cartella
        </button>
      </div>
      <small>Supporta selezione multipla o cartelle (browser compatibili)</small>
    </div>
  );
}
