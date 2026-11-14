import { useState } from 'react';
import { countries, type Country } from './country-bounds';

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const countryIndex = countries.map(country => ({ country, names: [country[0], ...country[1]].map(normalize) }));

function matchCountries(query: string) {
  const term = normalize(query);
  if (!term) return [];

  const exact = countryIndex.filter(({ names }) => names.includes(term));
  if (exact.length) return exact;
  const prefix = countryIndex.filter(({ names }) => names.some(name => name.startsWith(term)));
  if (prefix.length) return prefix;
  return countryIndex.filter(({ names }) => names.some(name => name.includes(term)));
}

export function CountrySearch({ onSelect }: { onSelect: (country: Country) => boolean }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  return (
    <form className="country-search" role="search" aria-label="Find a country on the map"
      onSubmit={event => {
        event.preventDefault();
        const matches = matchCountries(query);
        if (matches.length !== 1) {
          setError(matches.length ? 'More than one match. Enter the full country name.' : 'No matching country. Try another name.');
          return;
        }
        const { country } = matches[0];
        if (!onSelect(country)) {
          setError('The map is still loading. Try again in a moment.');
          return;
        }
        setQuery(country[0]);
        setError('');
        setStatus(`Map centered on ${country[0]}.`);
      }}>
      <div className="country-search-field">
        <input type="search" aria-label="Search for a country" autoComplete="off" required
          placeholder="Find a country" value={query} aria-describedby={error ? 'country-search-feedback' : undefined}
          onChange={event => { setQuery(event.target.value); setError(''); setStatus(''); }} />
        <button type="submit" aria-label="Go to country" title="Go to country">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" />
          </svg>
        </button>
      </div>
      {error && <p className="country-search-feedback" id="country-search-feedback" role="status">{error}</p>}
      <span className="country-search-status" role="status">{status}</span>
    </form>
  );
}
