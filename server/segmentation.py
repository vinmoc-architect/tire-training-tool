"""Modulo di supporto per segmentazione SAM/SAM2 tramite ultralytics.

Basato sul frammento fornito dall'utente, con piccoli adattamenti
(per esempio supporto opzionale alle label 0/1 per i punti)."""

import os
from typing import Dict, List, Optional

import cv2
import numpy as np

try:
    from ultralytics import SAM as UltralyticsSAM
except ImportError:  # pragma: no cover - rende l'errore più leggibile a runtime
    UltralyticsSAM = None


VALID_MODEL_SIZES = ("tiny", "small", "base", "large")

SAM_MODEL_FILES: Dict[str, str] = {
    "tiny": os.getenv("SAM_MODEL_TINY_PATH", "sam_t.pt"),
    "small": os.getenv("SAM_MODEL_SMALL_PATH", "sam_s.pt"),
    "base": os.getenv("SAM_MODEL_PATH") or os.getenv("SAM_MODEL_BASE_PATH", "sam_b.pt"),
    "large": os.getenv("SAM_MODEL_LARGE_PATH", "sam_l.pt"),
}

SAM2_MODEL_FILES: Dict[str, str] = {
    "tiny": os.getenv("SAM2_MODEL_TINY_PATH", "sam2_t.pt"),
    "small": os.getenv("SAM2_MODEL_SMALL_PATH", "sam2_s.pt"),
    "base": os.getenv("SAM2_MODEL_PATH") or os.getenv("SAM2_MODEL_BASE_PATH", "sam2_b.pt"),
    "large": os.getenv("SAM2_MODEL_LARGE_PATH", "sam2_l.pt"),
}

_model_cache: Dict[str, UltralyticsSAM] = {}


def _resolve_weights(algorithm: str, size: str) -> str:
    size = size.lower()
    if size not in VALID_MODEL_SIZES:
        raise ValueError(f"Dimensione modello non supportata: {size}")

    if algorithm == "sam":
        weights = SAM_MODEL_FILES[size]
    elif algorithm == "sam2":
        weights = SAM2_MODEL_FILES[size]
    else:
        raise ValueError(f"Algoritmo di segmentazione non supportato: {algorithm}")

    if not weights:
        raise ValueError(f"Peso del modello non configurato per {algorithm}:{size}")

    return weights


def _load_model(algorithm: str, size: str):
    if UltralyticsSAM is None:
        raise RuntimeError("Il modello SAM non è disponibile: installa ultralytics con supporto SAM.")

    cache_key = f"{algorithm}:{size.lower()}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    weights_path = _resolve_weights(algorithm, size)
    model = UltralyticsSAM(weights_path)
    _model_cache[cache_key] = model
    return model


def _segment_with_model(
    model,
    image_bytes: bytes,
    *,
    points: Optional[List[List[float]]] = None,
    labels: Optional[List[int]] = None,
    bbox: Optional[List[float]] = None,
    prompt_type: str = "point",
) -> bytes:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Immagine non valida o formato non supportato.")

    h, w = img.shape[:2]

    if prompt_type == "box":
        if bbox is None:
            raise ValueError("Devi fornire un bounding box per la modalità box.")
        bbox_arr = np.asarray(bbox, dtype=np.float32).reshape(-1)
        if bbox_arr.size != 4:
            raise ValueError("Il bounding box deve contenere 4 valori [x1, y1, x2, y2].")
        x1, y1, x2, y2 = bbox_arr
        x1, x2 = np.clip([x1, x2], 0, w - 1)
        y1, y2 = np.clip([y1, y2], 0, h - 1)
        x_min, x_max = (x1, x2) if x1 <= x2 else (x2, x1)
        y_min, y_max = (y1, y2) if y1 <= y2 else (y2, y1)
        if abs(x_max - x_min) < 1 or abs(y_max - y_min) < 1:
            raise ValueError("Il bounding box è troppo piccolo.")
        bbox_arr = np.array([x_min, y_min, x_max, y_max], dtype=np.float32)
        results = model.predict(img, bboxes=[bbox_arr.tolist()])
    else:
        if not points:
            raise ValueError("Devi fornire almeno un punto per la segmentazione.")
        points_arr = np.asarray(points, dtype=np.float32)
        if points_arr.ndim != 2 or points_arr.shape[1] != 2:
            raise ValueError("Ogni punto deve essere nella forma [x, y].")
        if labels is not None:
            label_arr = np.asarray(labels, dtype=np.int32).reshape(-1)
            if label_arr.size != len(points_arr):
                raise ValueError("Il numero di label non corrisponde ai punti.")
        else:
            label_arr = np.ones(len(points_arr), dtype=np.int32)
        label_arr = np.clip(label_arr, 0, 1).astype(int)
        results = model.predict(img, points=points_arr.tolist(), labels=label_arr.tolist())

    if not results or not getattr(results[0], "masks", None):
        raise ValueError("La segmentazione non ha prodotto risultati.")

    mask_tensor = results[0].masks.data[0]
    mask = mask_tensor.cpu().numpy() if hasattr(mask_tensor, "cpu") else np.asarray(mask_tensor)
    mask = (mask > 0.5).astype(np.uint8)

    # Crea un'immagine RGB dove i pixel al di fuori della maschera sono neri
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    masked_rgb = rgb_img.copy()
    # Imposta i pixel al di fuori della maschera a nero
    masked_rgb[mask == 0] = [0, 0, 0]

    x, y, w_box, h_box = cv2.boundingRect(mask)
    cropped_rgb = masked_rgb if w_box == 0 or h_box == 0 else masked_rgb[y : y + h_box, x : x + w_box]

    success, buffer = cv2.imencode(".png", cropped_rgb)
    if not success:
        raise RuntimeError("Impossibile codificare l'immagine segmentata.")

    return buffer.tobytes()


def segment_image(
    image_bytes: bytes,
    points: Optional[List[List[float]]],
    *,
    labels: Optional[List[int]] = None,
    model_size: str = "base",
    prompt_type: str = "point",
    bbox: Optional[List[float]] = None,
) -> bytes:
    model = _load_model("sam", model_size)
    return _segment_with_model(
        model,
        image_bytes,
        points=points,
        labels=labels,
        prompt_type=prompt_type,
        bbox=bbox,
    )


def segment_image_sam2(
    image_bytes: bytes,
    points: Optional[List[List[float]]],
    *,
    labels: Optional[List[int]] = None,
    model_size: str = "base",
    prompt_type: str = "point",
    bbox: Optional[List[float]] = None,
) -> bytes:
    model = _load_model("sam2", model_size)
    return _segment_with_model(
        model,
        image_bytes,
        points=points,
        labels=labels,
        bbox=bbox,
        prompt_type=prompt_type,
    )
