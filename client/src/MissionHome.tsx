import { MapAppearance } from './MapAppearance';
import type { ThemeProps } from './theme';
import MissionJourney from './MissionJourney';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import earthMobile from './assets/earth-at-night-768.webp';
import earthDesktop from './assets/earth-at-night-1920.webp';
import './mission-home.css';

export default function MissionHome({ theme, setTheme }: Pick<ThemeProps, 'theme' | 'setTheme'>) {
  return (
    <div className="mission-home">
      <header className="mission-home-header">
        <SiteBrand />
        <SiteNavigation current="home" />
        <MapAppearance value={theme} onChange={setTheme} />
      </header>
      <main>
        <section className="mission-hero" aria-labelledby="hero-heading">
          <img className="mission-earth" src={earthDesktop}
            srcSet={`${earthMobile} 768w, ${earthDesktop} 1920w`} sizes="100vw"
            width={1920} height={1920} fetchPriority="high" alt="" />
          <div className="mission-hero-content">
            <p className="mission-eyebrow">NASA Space Apps Challenge / MODIS + VIIRS</p>
            <h1 id="hero-heading">Fire activity across<br />seasons<span>.</span></h1>
            <p>Prometheus connects MODIS and VIIRS fire observations to explore when and where burning activity occurs, and how it changes across seasons.</p>
            <div className="mission-actions">
              <a className="mission-button" href="/explore/">Explore observations <span aria-hidden="true">↗</span></a>
              <a className="mission-secondary" href="/analytics/">Analyze activity <span aria-hidden="true">↗</span></a>
            </div>
            <a className="mission-method-link" href="#how-it-works">See how it works ↓</a>
          </div>
          <a className="mission-image-credit" href="https://science.nasa.gov/earth/earth-observatory/city-lights-of-africa-europe-and-the-middle-east-79793/">
            City lights, 2012 · NASA Earth Observatory / Robert Simmon · Suomi NPP VIIRS
          </a>
        </section>
        <section className="mission-project" aria-labelledby="project-heading">
          <h2 id="project-heading">Two satellite instruments. One fire history to understand.</h2>
          <div>
            <p>MODIS, aboard Terra and Aqua, provides a long record of active-fire observations. VIIRS provides finer spatial detail and extends that record through newer satellite missions. Both detect thermal anomalies: a hotspot is a satellite observation, not necessarily a separate wildfire.</p>
            <p><strong>Why harmonize?</strong> Different resolutions, overpass times and observation conditions affect what each instrument detects. Prometheus aims to make fire activity comparable across missions, so a change in sensor is not mistaken for a change in burning activity.</p>
            <p><strong>Our spatial model:</strong> Model B uses MODIS Aqua measurements to estimate the probability of a VIIRS detection in candidate 500 m cells. This is an estimated layer, with its own limits and provenance; it does not replace the original observations or establish a globally validated historical record.</p>
            <p><strong>For the user:</strong> select a region and period, inspect the map, explore the burning calendar, compare seasons where coverage allows, and export observations. The goal is to help researchers, land managers and emergency teams understand an area’s fire history.</p>
          </div>
        </section>
        <MissionJourney />
      </main>
    </div>
  );
}
