import { useEffect, useRef, useState } from 'react';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import earth from './assets/mission-earth.webp';
import './mission-home.css';

export default function MissionHome() {
  const [replay, setReplay] = useState(0);

  const [visible, setVisible] = useState(false);
  const method = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = method.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mission-home">
      <header className="mission-home-header">
        <SiteBrand />
        <SiteNavigation current="home" />
      </header>
      <main>
        <section className="mission-hero" aria-labelledby="hero-heading">
          <img className="mission-earth" src={earth} alt="" />
          <div className="mission-hero-content">
            <p className="mission-eyebrow">NASA Space Apps Challenge / Earth observation</p>
            <h1 id="hero-heading">Follow fire<br />from orbit<span>.</span></h1>
            <p>Explore MODIS and VIIRS fire detections, then inspect how Prometheus estimates where VIIRS would detect fire inside a MODIS footprint.</p>
            <div className="mission-actions">
              <a className="mission-button" href="/explore/">Explore observations <span aria-hidden="true">↗</span></a>
              <a className="mission-secondary" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
            </div>
          </div>
        </section>
        <section className="mission-method" id="how-it-works" ref={method} aria-labelledby="method-heading">
          <div className="mission-method-heading">
            <div>
              <p className="mission-eyebrow">How it works</p>
              <h2 id="method-heading">From a satellite pass to the explorer</h2>
            </div>
            <button className="mission-secondary mission-replay" type="button" onClick={() => setReplay(value => value + 1)}>Replay animation</button>
          </div>
          <div className="mission-stages" data-animate={visible} key={replay}>
            <article>
              <div className="mission-diagram mission-scan" aria-hidden="true">
                <div className="scan-sweep" />
                <span className="modis-mark" /><span className="viirs-mark" /><span className="viirs-mark" />
              </div>
              <h3>Observe from orbit</h3>
              <p>MODIS and VIIRS detect thermal anomalies during satellite passes. Each detection has a location and acquisition time.</p>
              <p className="mission-diagram-key">▲ MODIS <span>● VIIRS</span></p>
            </article>
            <article>
              <div className="mission-diagram mission-footprint" aria-hidden="true">
                <div className="mission-cell-grid">{Array.from({ length: 9 }, (_, cell) => <span key={cell} />)}</div>
              </div>
              <h3>Score candidate cells</h3>
              <p>Inside a detected Aqua MODIS fire footprint, Model B scores each 500 × 500 m candidate for a possible VIIRS detection.</p>
              <p className="mission-diagram-key">■ Higher model score</p>
            </article>
            <article>
              <div className="mission-diagram mission-timeline" aria-hidden="true">
                <div className="mission-time-track"><span /><span /><span /><i /></div>
                <div className="mission-time-labels"><span>00:00</span><span>12:00</span><span>24:00 UTC</span></div>
              </div>
              <h3>Compare in Explore</h3>
              <p>Filter by place, date or sensor. Play the timeline to see when detections appear and open a point to inspect its details.</p>
              <p className="mission-diagram-key"><a href="/explore/">Open the explorer ↗</a></p>
            </article>
          </div>
          <p className="mission-example">Illustrative diagrams. Open Explore for the observations and controls.</p>
        </section>
      </main>
    </div>
  );
}
