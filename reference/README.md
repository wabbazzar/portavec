# reference/

Python oracle implementations that the TypeScript algorithms must match.

## convert.py

Directional ASCII art converter. Ported to TS as
`src/algorithms/ascii/directional.ts`.

Originally from `../../rave-monitor-animation/monitor/convert.py` — the
rave-monitor project used it to generate the rabbit silhouette frames.
Parameterized during the port (was hardcoded to a single image path and
80x40 grid).

### Regenerate goldens

Goldens in `goldens/` are checked in and used by the vitest suite. To
refresh them (e.g. after tweaking the algorithm):

    python3 reference/convert.py generate \
        --input test-images/letter-a-256.png \
        --output reference/goldens/letter-a.json

    python3 reference/convert.py generate \
        --input test-images/circle-256.png \
        --output reference/goldens/circle.json

    python3 reference/convert.py generate \
        --input test-images/concentric-rings-256.png \
        --output reference/goldens/rings.json

### Role

- `asciifyGrid` in the TS port must match the oracle **bit-exactly**
  when given the oracle's brightness/gradient grids. Tests in
  `tests/algorithms/ascii/directional.test.ts` enforce this.

- `imageToAscii` uses its own area-average resize (canvas-compatible)
  rather than PIL LANCZOS, so its output differs from the oracle at
  the preprocessing stage. Tests compare end-to-end output via char
  IoU and exact-char match with tolerance.
