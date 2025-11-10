import { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal__header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} className="modal__close" aria-label="Chiudi modale">
            x
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
