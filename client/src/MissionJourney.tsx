import { useEffect, useRef, type CSSProperties } from 'react';
const stages = [
 ['It begins with a satellite pass.', 'Observe', 'MODIS and VIIRS detect thermal anomalies from orbit. Observations record location, acquisition time and measured fire radiative power when available.'],
 ['Every observation has a source.', 'Collect', 'FIRMS supplies hotspot records. NASA Earthdata supplies fire masks, radiances and geolocation. Source identifiers keep the collection traceable.'],
 ['Prepare the data. Keep the context.', 'Prepare', 'The pipeline aligns locations and acquisition times, checks quality and coverage, and builds candidate 500 m cells around detected MODIS footprints. Cloud and missing coverage remain unknown.'],
 ['Measurements become probabilities.', 'Estimate', 'Model B uses MODIS-derived features to estimate the probability of a VIIRS detection in each candidate cell. VIIRS is the training reference, not an input at prediction time. The score does not locate flames precisely.'],
 ['A new layer, with its provenance.', 'Preserve', 'Each output keeps its cell geometry, timestamp, estimated score, source and model version. These cells remain distinct from measured satellite observations. This model does not predict FRP per cell.'],
 ['Turn observations into understanding.', 'Explore', 'Choose a region and date range, inspect detections, and explore the burning calendar. Compare periods where coverage allows and export observations. Native hotspot counts and estimated positive cells are different units.'],
];
function JourneyVisual({ step }: { step: number }) {
 const labels = ['ORBITAL ACQUISITION','SOURCE COLLECTION','OBSERVATION ALIGNMENT','PROBABILITY ESTIMATION','HARMONIZED LAYER','SEASONAL EXPLORATION'];
 return <div className={`cinema-scene cinema-scene-${step}`} aria-hidden="true">
 <div className="cinema-topline"><span>PROMETHEUS / 0{step+1}</span><span>PROCESS STUDY</span></div>
 <div className="cinema-stage">
 {step===0 ? <><div className="cinema-world"/><div className="cinema-orbit"/><div className="cinema-spacecraft"><i className="solar-panel"/><div className="satellite-body"><i/><b/></div><i className="solar-panel"/></div><div className="cinema-scan-beam"/><div className="cinema-target"><i/><i/><i/></div><div className="cinema-coordinate">THERMAL SIGNAL<br/><strong>OBSERVE · LOCATE · TIME</strong></div></>
 :step===1 ? <><div className="cinema-stream">{Array.from({length:18},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div><div className="cinema-stack">{['RADIANCE / GEOLOCATION','FIRE MASK / QUALITY','FIRMS / DETECTIONS'].map((label,i)=><div className="data-sheet" key={label} style={{'--i':i} as CSSProperties}><span>{label}</span><div className="sheet-lines"/><b>0{3-i}</b></div>)}</div></>
 :step===2 ? <><div className="cinema-alignment">{['ACQUISITION TIME','OBSERVATION QUALITY','SPATIAL SUPPORT'].map((label,i)=><div className="alignment-plane" key={label} style={{'--i':i} as CSSProperties}><span>{label}</span><div className="plane-cross"/></div>)}</div><div className="cinema-coordinate">ALIGNED OBSERVATIONS<br/><strong>UNKNOWN REMAINS UNKNOWN</strong></div></>
 :step===3 ? <><div className="cinema-model"><div className="model-orbit"/><div className="model-core"><small>MODIS → FEATURES</small><b>B</b><span>DETECTION PROBABILITY</span></div></div><div className="model-scores">{['0.12','0.82','0.67'].map((v,i)=><div key={v} style={{'--i':i} as CSSProperties}><small>CELL / 0{i+1}</small><strong>{v}</strong><i/></div>)}</div></>
 :step===4 ? <><div className="cinema-terrain">{Array.from({length:36},(_,i)=><i className={[14,15,20,21,22].includes(i)?'terrain-hot':''} key={i} style={{'--i':i,'--height':`${[14,15,20,21,22].includes(i)?25+(i%3)*12:3}px`} as CSSProperties}/>)}</div><div className="cinema-coordinate">500 × 500 m<br/><strong>ESTIMATED ANALYSIS CELLS</strong></div><div className="terrain-legend"><span/>LOW <span/>HIGH PROBABILITY</div></>
 :<div className="cinema-dashboard"><div className="dashboard-top"><span>ACTIVITY / CALENDAR</span><span>ILLUSTRATIVE</span></div><div className="cinema-calendar">{Array.from({length:84},(_,i)=><i key={i} style={{'--i':i,'--heat':i%11===0?1:i%5===0?.7:i%3===0?.35:.08} as CSSProperties}/>)}</div><div className="cinema-chart">{Array.from({length:24},(_,i)=><i key={i} style={{'--i':i,height:`${18+Math.sin(i*.7)**2*68}%`} as CSSProperties}/>)}</div></div>}
 </div><div className="cinema-bottomline"><span>{labels[step]}</span><span>ILLUSTRATIVE / NOT LIVE</span></div></div>;
}
export default function MissionJourney() {
 const container=useRef<HTMLElement>(null);
 useEffect(()=>{
 const rows=container.current?.querySelectorAll<HTMLElement>('.journey-step');
 if(!rows || !('IntersectionObserver' in window)) return;
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-visible',entry.isIntersecting)),{threshold:.18});
 rows.forEach(row=>{row.classList.add('reveal-ready');observer.observe(row);});
 return ()=>observer.disconnect();
 },[]);
 return <section className="mission-journey" id="how-it-works" ref={container} aria-labelledby="journey-heading"><div className="journey-intro"><p className="mission-eyebrow">Follow the data</p><h2 id="journey-heading">One journey.<br/>From orbit to insight.</h2><p>Scroll through the six steps behind Prometheus.</p></div>
 {stages.map(([title,label,detail],i)=><article className="journey-step" key={label}><div className="journey-copy"><p className="mission-eyebrow">0{i+1} / {label}</p><h3>{title}</h3><p>{detail}</p>{i===5&&<a className="mission-button" href="/analytics/">Explore the calendar ↗</a>}</div><figure className="journey-art"><JourneyVisual step={i}/><figcaption>{label} — illustrative process, not live observations</figcaption></figure></article>)}
 <p className="journey-note">Illustrative workflow. Availability, coverage and provenance depend on the selected dataset. Estimated cells are not counts of physical fires.</p></section>;
}
