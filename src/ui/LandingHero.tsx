import { useEffect, useRef, useState } from 'react';
import './LandingHero.css';

/**
 * Auto-playing before/after hero for the landing page.
 *
 * Sweeps the split between the raster source and the final vectorized
 * SVG on a ~6s loop. Hover pauses the animation so users can rest on
 * an interesting split. Tap-and-drag works too.
 *
 * The two assets (step-1-original.png, step-4-final.svg) are the same
 * files the About page uses, baked by scripts/build-about-stages.ts.
 */
export function LandingHero() {
  const base = import.meta.env.BASE_URL;
  const [split, setSplit] = useState(50);
  const [userDrive, setUserDrive] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Auto-sweep when not under user control. Ping-pong 15 → 85 over ~6s.
  useEffect(() => {
    if (userDrive) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const dt = (t - t0) / 1000;
      // Period 6s, amplitude 70, center 50 → range 15 .. 85.
      const v = 50 + 35 * Math.sin((dt * 2 * Math.PI) / 6);
      setSplit(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [userDrive]);

  const pxToPct = (clientX: number): number => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return split;
    return Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    setUserDrive(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSplit(pxToPct(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setSplit(pxToPct(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    // Re-enable auto-sweep after a brief delay if the pointer has left.
    setTimeout(() => { if (!draggingRef.current) setUserDrive(false); }, 1500);
  };

  const scrollToUpload = () => {
    const target = document.querySelector('.upload-section, .image-loader');
    if (target) (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="landing-hero" aria-label="What Portavec does">
      <div className="hero-copy">
        <div className="hero-eyebrow">Raster → Vector</div>
        <h2 className="hero-headline">
          Drop an image.
          <br />
          <span className="accent">Get a vector.</span>
        </h2>
        <p className="hero-sub">
          Every stage runs in your browser. No upload, no server, no sign-up. Drag the handle to
          compare.
        </p>
        <div className="hero-ctas">
          <button className="hero-cta primary" onClick={scrollToUpload}>
            Try your own →
          </button>
          <a className="hero-cta secondary" href="#/about" onClick={(e) => { e.preventDefault(); window.location.hash = '#/about'; }}>
            How it works
          </a>
        </div>
      </div>

      <div
        ref={frameRef}
        className="hero-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => setUserDrive(true)}
        onMouseLeave={() => { if (!draggingRef.current) setUserDrive(false); }}
      >
        <div className="hero-layer hero-after">
          <object data={`${base}about/step-4-final.svg`} type="image/svg+xml" aria-label="Vectorized">
            <img src={`${base}about/step-4-final.svg`} alt="Vectorized" />
          </object>
          <span className="hero-label hero-label-after">vector</span>
        </div>
        <div className="hero-layer hero-before" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <img src={`${base}about/step-1-original.png`} alt="Original raster" draggable={false} />
          <span className="hero-label hero-label-before">raster</span>
        </div>
        <div className="hero-handle" style={{ left: `${split}%` }} aria-hidden>
          <div className="hero-handle-line" />
          <div className="hero-handle-knob">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <path d="M8 6 L3 12 L8 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 6 L21 12 L16 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
