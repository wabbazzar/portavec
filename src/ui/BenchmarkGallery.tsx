import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch } from './context/AppContext';
import { loadImageFromUrl } from '../utils/image';

interface ManifestEntry {
  name: string;
  png: string;
  truth: string;
  seed: number;
  shapeCount: number;
  size: number;
  allowOverlap: boolean;
  paletteLength: number;
  noise?: string;
}

interface RealEntry {
  name: string;
  png: string;
  label: string;
  description: string;
}

interface Manifest {
  generatedAt: string;
  count: number;
  entries: ManifestEntry[];
  real?: RealEntry[];
}

interface TuningEntry {
  hasTruth: boolean;
  best: {
    config: {
      k?: number;
      saliencyWeight: number;
      salientSeedBudget: number;
      mergeThreshold: number;
    };
    score: number;
    scoreType: string;
    paths: number;
    uniqueFills: number;
  };
  runCount: number;
}

interface TuningManifest {
  generatedAt: string;
  entries: Record<string, TuningEntry>;
}

export function BenchmarkGallery() {
  const dispatch = useAppDispatch();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [tuning, setTuning] = useState<TuningManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}training/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      })
      .then(setManifest)
      .catch((e) => setError(String(e)));
    // Tuning manifest is optional — if missing, images just use pipeline defaults.
    fetch(`${import.meta.env.BASE_URL}training/tuning-manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (m) setTuning(m); })
      .catch(() => { /* silent — tuning is best-effort */ });
  }, []);

  const grouped = useMemo(() => {
    if (!manifest) return [];
    const byCount = new Map<number, ManifestEntry[]>();
    for (const e of manifest.entries) {
      if (!byCount.has(e.shapeCount)) byCount.set(e.shapeCount, []);
      byCount.get(e.shapeCount)!.push(e);
    }
    return [...byCount.entries()].sort(([a], [b]) => a - b);
  }, [manifest]);

  const loadByPng = async (name: string, png: string) => {
    setLoading(name);
    try {
      const image = await loadImageFromUrl(`${import.meta.env.BASE_URL}training/${png}`);
      dispatch({
        type: 'SET_SOURCE_IMAGE',
        payload: { image, fileName: png, sourceType: 'benchmark' },
      });
      // If this image has a tuned config, auto-populate the parameter controls.
      const entry = tuning?.entries[name];
      if (entry) {
        const cfg = entry.best.config;
        dispatch({
          type: 'SET_PARAMETERS',
          payload: {
            colors: cfg.k ?? 0, // 0 = auto
            saliencyWeight: cfg.saliencyWeight,
            salientSeedBudget: cfg.salientSeedBudget,
            mergeThreshold: cfg.mergeThreshold,
            tuned: true,
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };
  const loadEntry = (e: ManifestEntry) => loadByPng(e.name, e.png);
  const loadReal = (r: RealEntry) => loadByPng(r.name, r.png);

  if (error) {
    return (
      <div className="gallery-error">
        <strong>Gallery error:</strong> {error}
      </div>
    );
  }
  if (!manifest) {
    return <div className="gallery-loading">Loading benchmark gallery…</div>;
  }

  return (
    <div className="benchmark-gallery">
      <div className="gallery-header">
        <div className="gallery-title">
          Benchmark Training Set
          <span className="count">{manifest.count}</span>
        </div>
        <div className="gallery-sub">click any tile to load as source</div>
      </div>
      <div className="gallery-groups">
        {manifest.real && manifest.real.length > 0 && (
          <div className="gallery-group">
            <div className="gallery-group-label">
              <span className="badge accent-badge">real images</span>
              <span className="hint">qualitative — no ground truth</span>
            </div>
            <div className="gallery-grid real-grid">
              {manifest.real.map((r) => (
                <button
                  key={r.name}
                  className={`gallery-tile real-tile ${loading === r.name ? 'loading' : ''}`}
                  onClick={() => loadReal(r)}
                  title={r.description}
                >
                  <div className="gallery-tile-thumb">
                    <img src={`${import.meta.env.BASE_URL}training/${r.png}`} alt={r.label} loading="lazy" />
                    <span className="gallery-tile-overlay">real</span>
                  </div>
                  <div className="gallery-tile-caption">
                    <span className="gallery-tile-name">{r.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {grouped.map(([shapeCount, entries]) => (
          <div key={shapeCount} className="gallery-group">
            <div className="gallery-group-label">
              <span className="badge">{shapeCount} shapes</span>
              <span className="hint">{entries.length} seeds · {entries[0]?.size}px · overlap</span>
            </div>
            <div className="gallery-grid">
              {entries.map((e) => (
                <button
                  key={e.name}
                  className={`gallery-tile ${loading === e.name ? 'loading' : ''}`}
                  onClick={() => loadEntry(e)}
                  title={`${e.name} · seed ${e.seed} · ${e.shapeCount} shapes · ${e.size}px`}
                >
                  <div className="gallery-tile-thumb">
                    <img src={`${import.meta.env.BASE_URL}training/${e.png}`} alt={e.name} loading="lazy" />
                    <span className="gallery-tile-overlay">seed {e.seed}</span>
                    {e.noise && e.noise !== 'clean' && (
                      <span className="gallery-tile-noise">{e.noise}</span>
                    )}
                  </div>
                  <div className="gallery-tile-caption">
                    <span className="gallery-tile-name">{e.name}</span>
                    <span className="gallery-tile-meta">
                      <span>{e.paletteLength}c</span>
                      <span className="dot" />
                      <span>{e.size}px</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
