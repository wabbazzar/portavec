#!/usr/bin/env python3
"""
ASCII art oracle for portavec.

Ported from rave-monitor-animation/monitor/convert.py with hardcoded
constants replaced by CLI flags. Used as the reference implementation
that the TypeScript port in src/algorithms/ascii/ must match.

Usage:
    python3 convert.py generate --input path/to/img.png \
            [--cols 80] [--rows 40] [--char-aspect 0.48] \
            [--threshold 40] [--faint-threshold 25] \
            [--output path/to/golden.json]

    python3 convert.py iterate --input path/to/img.png \
            [--cols 80] [--rows 40] [--iterations 100] \
            [--output path/to/golden.json]

Output JSON schema:
    {
      "input":          "path/to/img.png",
      "cols":           80,
      "rows":           40,
      "char_aspect":    0.48,
      "threshold":      40,
      "faint_threshold": 25,
      "brightness":     [[float, ...], ...]   # rows x cols
      "grad_x":         [[float, ...], ...]
      "grad_y":         [[float, ...], ...]
      "lines":          ["string of length cols", ...]   # length = rows
      "score": {                                         # iterate only
        "iou": ..., "accuracy": ..., "precision": ..., "recall": ...,
        "true_pos": ..., "true_neg": ..., "false_pos": ..., "false_neg": ...
      }
    }
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def load_and_prepare(path: str, cols: int, rows: int, char_aspect: float):
    """Load image, resize to target grid, return brightness + gradient arrays."""
    img = Image.open(path).convert("L")

    # Resize: each pixel = one character cell
    resized = img.resize((cols, rows), Image.LANCZOS)
    brightness = np.array(resized, dtype=float)

    # Compute Sobel-like gradients on a 4x oversampled grid, then avg down.
    hr_w = cols * 4
    hr_h = rows * 4
    hr = img.resize((hr_w, hr_h), Image.LANCZOS)
    hr_arr = np.array(hr, dtype=float)

    gx = np.zeros_like(hr_arr)
    gy = np.zeros_like(hr_arr)
    gx[:, 1:-1] = hr_arr[:, 2:] - hr_arr[:, :-2]
    gy[1:-1, :] = hr_arr[2:, :] - hr_arr[:-2, :]

    grad_x = np.zeros((rows, cols))
    grad_y = np.zeros((rows, cols))
    for r in range(rows):
        for c in range(cols):
            r0, r1 = r * 4, (r + 1) * 4
            c0, c1 = c * 4, (c + 1) * 4
            grad_x[r, c] = np.mean(gx[r0:r1, c0:c1])
            grad_y[r, c] = np.mean(gy[r0:r1, c0:c1])

    # char_aspect is retained in output metadata but not used in the
    # resize math (matches the original convert.py behavior).
    return brightness, grad_x, grad_y


def image_to_ascii(brightness, grad_x, grad_y, threshold=40, faint_threshold=25):
    """Convert brightness + gradient arrays to an ASCII character grid."""
    rows, cols = brightness.shape
    lines = []

    for r in range(rows):
        line = []
        for c in range(cols):
            b = brightness[r, c]

            if b < faint_threshold:
                line.append(' ')
                continue

            if b < threshold:
                line.append('.')
                continue

            gx = grad_x[r, c]
            gy = grad_y[r, c]
            mag = math.sqrt(gx * gx + gy * gy)

            if mag < 5:
                if b > 180:
                    line.append('#')
                elif b > 120:
                    line.append('+')
                else:
                    line.append(':')
                continue

            # Edge direction is perpendicular to gradient direction.
            edge_angle = math.atan2(gx, -gy)
            deg = math.degrees(edge_angle) % 180

            if 67.5 < deg < 112.5:
                line.append('|')
            elif deg < 22.5 or deg > 157.5:
                line.append('-')
            elif 22.5 <= deg <= 67.5:
                line.append('/')
            else:
                line.append('\\')

        lines.append(''.join(line))

    return lines


def score_frame(frame_lines, brightness, threshold=35):
    """Score ASCII frame against brightness mask. Returns metrics dict."""
    rows = min(len(frame_lines), brightness.shape[0])
    cols = min(max((len(l) for l in frame_lines), default=0), brightness.shape[1])

    tp = tn = fp = fn = 0
    for r in range(rows):
        line = frame_lines[r] if r < len(frame_lines) else ''
        for c in range(cols):
            has_char = c < len(line) and line[c] != ' '
            has_pixel = brightness[r, c] >= threshold
            if has_char and has_pixel:
                tp += 1
            elif not has_char and not has_pixel:
                tn += 1
            elif has_char and not has_pixel:
                fp += 1
            else:
                fn += 1

    total = tp + tn + fp + fn
    acc = (tp + tn) / total * 100 if total > 0 else 0
    iou = tp / (tp + fp + fn) * 100 if (tp + fp + fn) > 0 else 0
    prec = tp / (tp + fp) * 100 if (tp + fp) > 0 else 0
    rec = tp / (tp + fn) * 100 if (tp + fn) > 0 else 0
    return {
        'accuracy': acc, 'iou': iou, 'precision': prec, 'recall': rec,
        'true_pos': tp, 'true_neg': tn, 'false_pos': fp, 'false_neg': fn,
    }


def iterate_thresholds(brightness, grad_x, grad_y, n_iterations=100):
    best_score = -1.0
    best = None
    for i in range(n_iterations):
        threshold = 25 + (i % 20) * 3
        faint_threshold = max(10, threshold - 15 - (i // 20) * 3)
        art = image_to_ascii(brightness, grad_x, grad_y,
                             threshold=threshold,
                             faint_threshold=faint_threshold)
        score_thresh = max(25, threshold - 10)
        result = score_frame(art, brightness, threshold=score_thresh)
        if result['iou'] > best_score:
            best_score = result['iou']
            best = {
                'lines': art,
                'threshold': threshold,
                'faint_threshold': faint_threshold,
                'score_threshold': score_thresh,
                'score': result,
            }
    return best


def build_output(input_path, cols, rows, char_aspect, brightness, grad_x, grad_y,
                 lines, threshold, faint_threshold, score=None):
    out = {
        'input': str(input_path),
        'cols': cols,
        'rows': rows,
        'char_aspect': char_aspect,
        'threshold': threshold,
        'faint_threshold': faint_threshold,
        'brightness': brightness.tolist(),
        'grad_x': grad_x.tolist(),
        'grad_y': grad_y.tolist(),
        'lines': lines,
    }
    if score is not None:
        out['score'] = score
    return out


def cmd_generate(args):
    brightness, grad_x, grad_y = load_and_prepare(
        args.input, args.cols, args.rows, args.char_aspect)
    lines = image_to_ascii(
        brightness, grad_x, grad_y,
        threshold=args.threshold,
        faint_threshold=args.faint_threshold)
    out = build_output(
        args.input, args.cols, args.rows, args.char_aspect,
        brightness, grad_x, grad_y, lines,
        args.threshold, args.faint_threshold)
    emit(out, args.output)


def cmd_iterate(args):
    brightness, grad_x, grad_y = load_and_prepare(
        args.input, args.cols, args.rows, args.char_aspect)
    best = iterate_thresholds(brightness, grad_x, grad_y, args.iterations)
    out = build_output(
        args.input, args.cols, args.rows, args.char_aspect,
        brightness, grad_x, grad_y, best['lines'],
        best['threshold'], best['faint_threshold'], score=best['score'])
    emit(out, args.output)


def emit(out, output_path):
    text = json.dumps(out, indent=2)
    if output_path:
        Path(output_path).write_text(text)
        sys.stderr.write(f"Wrote {output_path}\n")
    else:
        sys.stdout.write(text)
        sys.stdout.write('\n')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='cmd', required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--input', required=True)
    common.add_argument('--cols', type=int, default=80)
    common.add_argument('--rows', type=int, default=40)
    common.add_argument('--char-aspect', type=float, default=0.48)
    common.add_argument('--output', default=None)

    gen = sub.add_parser('generate', parents=[common])
    gen.add_argument('--threshold', type=int, default=40)
    gen.add_argument('--faint-threshold', type=int, default=25)
    gen.set_defaults(func=cmd_generate)

    it = sub.add_parser('iterate', parents=[common])
    it.add_argument('--iterations', type=int, default=100)
    it.set_defaults(func=cmd_iterate)

    args = p.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
