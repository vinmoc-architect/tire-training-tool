import argparse
import base64
from pathlib import Path

import cv2
import numpy as np


def load_image(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError('Impossibile leggere il file di input')
    return img


def to_bgr(gray: np.ndarray, alpha: np.ndarray | None) -> np.ndarray:
    # Ignora il canale alpha e crea sempre un'immagine RGB
    # Converti la scala di grigi in BGR (3 canali)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def apply_processing(img: np.ndarray, mode: str) -> np.ndarray:
    # Se l'immagine ha 4 canali (BGRA), prendi solo i primi 3 (BGR)
    if img.ndim == 3 and img.shape[2] == 4:
        bgr = img[:, :, :3]
    else:
        bgr = img

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if mode == 'standard':
        processed = gray
    elif mode == 'clahe':
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        processed = clahe.apply(gray)
    elif mode == 'adaptive':
        processed = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                          cv2.THRESH_BINARY, 11, 2)
    elif mode == 'gaussian':
        processed = cv2.GaussianBlur(gray, (5, 5), 0)
    else:
        raise ValueError(f'Modalità non supportata: {mode}')
    return to_bgr(processed, None)


def main() -> None:
    parser = argparse.ArgumentParser(description='Preprocess grayscale runner')
    parser.add_argument('--image', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--mode', choices=['standard', 'clahe', 'adaptive', 'gaussian'], default='standard')
    args = parser.parse_args()

    img = load_image(args.image)
    processed = apply_processing(img, args.mode)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(args.output, processed)


if __name__ == '__main__':
    main()
