import { countryName } from './country-filter';
import { useDashboard } from './dashboard-context';
import { DatasetControls } from './DashboardControls';
import { explorePreset } from './explore-presets';
import { navigateDashboard } from './dashboard-navigation';

/** Everyday exploration shortcuts stay separate from research and ingestion controls. */
export function ExploreControls({ onPeriodChange }: { onPeriodChange(): void }) {
  const { state, dispatch, archive } = useDashboard();
  const meta = state.collection.metadata;
  const latest = archive.active ? archive.data?.totals.last : meta.observed_to || state.collection.features.reduce<string | null>((last, f) => { const t = f.properties.observed_at_utc; return t && (!last || t > last) ? t : last; }, null);
  const preset = (days: number) => {
    const dates = explorePreset(latest, days);
    if (!dates) return;
    onPeriodChange();
    if (archive.active) archive.apply({ ...dates, platform: archive.platform, year: dates.endDate.slice(0, 4), month: 'ALL' });
    else dispatch({ type: 'filters', patch: { ...dates, selectedDay: null } });
  };
  const historical = meta.source === 'csv' || meta.temporary || meta.archive;
  return <section className="panel-section explore-periods">
    <h3>Choose when to explore</h3>
    <p>Search for a place on the map, then choose a period.</p>
    <div className="explore-shortcuts" role="group" aria-label="Available data period shortcuts">{[{days:1,label:'Latest available day'},{days:7,label:'Last 7 available days'},{days:30,label:'Last 30 available days'}].map(({days,label}) => <button key={days} disabled={!latest || archive.busy} onClick={() => preset(days)}>{label}</button>)}</div>
    <dl className="explore-selection"><dt>Selected dates · UTC</dt><dd>{state.filters.startDate ? `${state.filters.startDate} to ${state.filters.endDate}` : meta.gold ? 'Waiting for Morocco dates' : 'Undated examples'}</dd><dt>Area filter</dt><dd>{[state.filters.country ? countryName(state.filters.country) : '', state.filters.area ? 'Selected region' : ''].filter(Boolean).join(' / ') || 'All locations'}{(state.filters.area || state.filters.country) && <button onClick={() => dispatch({type:'filters',patch:{area:null,country:null}})}>Clear region</button>}</dd><dt>Data status</dt><dd>{meta.live ? 'Live source' : meta.source === 'simulated' || meta.source === 'demo' ? 'Illustrative examples' : historical ? 'Historical / test observations' : 'Loaded snapshot'}{latest && <small>Latest in the current selection: {latest.slice(0,10)} UTC</small>}</dd></dl>
    <p className="filter-help">Shortcuts end at the latest observation in the current selection. They do not indicate complete coverage or current fire activity.</p>
    <details><summary>Dataset and custom dates</summary><DatasetControls /></details>
    <div className="explore-next"><a href="/analytics/" onClick={event => navigateDashboard(event,'/analytics/')}>Analyze this selection</a><a href="/monitor/" onClick={event => navigateDashboard(event,'/monitor/')}>Monitor the last 24 hours</a></div>
  </section>;
}
