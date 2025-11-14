import argparse
import base64
import json
from pathlib import Path
from typing import Optional

from segmentation import segment_image, segment_image_sam2


def decode_json_b64(value: Optional[str]):
    if not value:
        return None
    data = base64.b64decode(value.encode("utf-8")).decode("utf-8")
    return json.loads(data)


def main() -> None:
    parser = argparse.ArgumentParser(description="Runner CLI per SAM/SAM2 (ultralytics)")
    parser.add_argument("--image", required=True, help="Path immagine di input")
    parser.add_argument("--output", required=True, help="Path dove salvare il PNG risultante")
    parser.add_argument("--algorithm", choices=["sam", "sam2"], default="sam2")
    parser.add_argument("--model-size", default="base")
    parser.add_argument("--prompt-type", choices=["point", "box"], default="point")
    parser.add_argument("--points-b64", default=None)
    parser.add_argument("--labels-b64", default=None)
    parser.add_argument("--bbox-b64", default=None)
    args = parser.parse_args()

    image_bytes = Path(args.image).read_bytes()
    points = decode_json_b64(args.points_b64)
    labels = decode_json_b64(args.labels_b64)
    bbox = decode_json_b64(args.bbox_b64)

    if args.prompt_type == "box" and bbox is None:
        raise SystemExit("Per prompt box devi fornire il bbox")

    if args.algorithm == "sam2":
        mask_bytes = segment_image_sam2(
            image_bytes,
            points,
            labels=labels,
            model_size=args.model_size,
            prompt_type=args.prompt_type,
            bbox=bbox,
        )
    else:
        mask_bytes = segment_image(
            image_bytes,
            points,
            labels=labels,
            model_size=args.model_size,
            prompt_type=args.prompt_type,
            bbox=bbox,
        )

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_bytes(mask_bytes)


if __name__ == "__main__":
    main()
