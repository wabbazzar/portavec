import { useEffect } from 'react';
import './AboutPage.css';

interface Stage {
  num: string;
  label: string;
  title: string;
  src: string;
  srcType: 'img' | 'object';
  caption: string;
}

export function AboutPage({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const base = import.meta.env.BASE_URL;

  const stages: Stage[] = [
    {
      num: '01',
      label: 'Raster',
      title: 'Pixels, stored in a grid.',
      src: `${base}about/step-1-original.png`,
      srcType: 'img',
      caption:
        "A 1,376 × 768 image is 1,056,768 colored pixels. Zoom in and the texture dissolves into a stained-glass of noisy edges. We need to recover the underlying shapes.",
    },
    {
      num: '02',
      label: 'Quantize',
      title: 'Reduce to a small palette.',
      src: `${base}about/step-2-quantized.png`,
      srcType: 'img',
      caption:
        "Adaptive median denoise (skipped here — this image is clean) then seeded k-means++ in CIE Lab color space. A saliency pre-pass reserves cluster slots for rare high-chroma hues so painted details survive. Here: k = 20, 8 slots reserved for salient colors.",
    },
    {
      num: '03',
      label: 'Trace',
      title: 'Find every color boundary.',
      src: `${base}about/step-3-contours.svg`,
      srcType: 'object',
      caption:
        "Marching squares walks each cluster's mask 2×2 at a time, emitting closed polygons wherever the cluster meets a neighbor. Holes and nested regions are detected via point-in-polygon tests. Douglas-Peucker removes near-collinear vertices.",
    },
    {
      num: '04',
      label: 'Fit',
      title: 'Turn polygons into smooth curves.',
      src: `${base}about/step-4-final.svg`,
      srcType: 'object',
      caption:
        "Schneider's recursive cubic-Bézier fit converts each polyline into curves. Corners are preserved (angle-deviation test); smooth sections become C segments. Each cluster is stacked back-to-front as a single SVG <path fill=\"…\"> — 11,183 paths total here.",
    },
  ];

  return (
    <div className="about-page">
      <header className="about-header">
        <div className="about-header-inner">
          <button className="about-back" onClick={onBack} aria-label="Back to demo">
            ← Demo
          </button>
          <div className="about-brand">Portavec</div>
          <a
            className="about-github"
            href="https://github.com/wabbazzar/portavec"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <main className="about-main">
        <section className="about-hero">
          <div className="about-eyebrow">About</div>
          <h1 className="about-title">
            From raster to vector,
            <br />
            <span className="accent">in the browser.</span>
          </h1>
          <p className="about-lede">
            Portavec takes a rasterized image — pixels stored in a 2D grid of colors — and turns it
            into a vector file you can zoom into forever. Every stage runs on your device. No
            upload, no server, no sign-up.
          </p>
        </section>

        <section className="about-section">
          <div className="about-section-label">The pipeline, one image at a time</div>
          <div className="about-stages">
            {stages.map((s) => (
              <article key={s.num} className="stage-card">
                <div className="stage-head">
                  <span className="stage-num">{s.num}</span>
                  <span className="stage-label">{s.label}</span>
                </div>
                <h2 className="stage-title">{s.title}</h2>
                <div className="stage-figure">
                  {s.srcType === 'img' ? (
                    <img src={s.src} alt={s.title} loading="lazy" />
                  ) : (
                    <object data={s.src} type="image/svg+xml" aria-label={s.title}>
                      <img src={s.src} alt={s.title} loading="lazy" />
                    </object>
                  )}
                </div>
                <p className="stage-caption">{s.caption}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section about-two-col">
          <div>
            <div className="about-section-label">Why</div>
            <h2 className="about-h2">A private, explainable alternative.</h2>
            <ul className="about-list">
              <li>Your image never leaves the browser tab.</li>
              <li>Every stage is visible and tunable from the UI.</li>
              <li>The same pipeline runs on the CLI for benchmarking.</li>
              <li>Deterministic — same input and seed, same output.</li>
            </ul>
          </div>
          <div>
            <div className="about-section-label">How</div>
            <h2 className="about-h2">How it's built.</h2>
            <ul className="about-list">
              <li>
                <strong>TypeScript</strong> end to end — the pipeline modules are pure functions
                with no DOM or Node deps.
              </li>
              <li>
                <strong>Web Worker</strong> for the heavy lifting so the UI stays responsive during
                multi-second renders.
              </li>
              <li>
                <strong>Ground-truth harness</strong> — 180 synthetic images with known palettes
                plus a blind-barrier loss function. Lets a grid search auto-tune per-image params.
              </li>
              <li>
                <strong>232 tests</strong> across k-means, marching squares, curve fit, and the
                benchmark suite, all passing before every commit.
              </li>
            </ul>
          </div>
        </section>

        <section className="about-section about-stack">
          <div className="about-section-label">Stack</div>
          <div className="stack-row">
            <span>Vite</span>
            <span>·</span>
            <span>React 18</span>
            <span>·</span>
            <span>TypeScript</span>
            <span>·</span>
            <span>Vitest</span>
            <span>·</span>
            <span>GitHub Actions → Pages</span>
          </div>
        </section>

        <section className="about-cta">
          <button className="about-cta-btn" onClick={onBack}>
            Try it →
          </button>
        </section>
      </main>

      <footer className="about-footer">
        <div>
          Built by{' '}
          <a href="https://wabbazzar.com" target="_blank" rel="noreferrer">
            Wesley Beckner
          </a>{' '}
          · MIT licensed
        </div>
        <div>
          <a href="https://github.com/wabbazzar/portavec" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
