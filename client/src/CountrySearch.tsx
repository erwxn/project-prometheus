import { useEffect, useId, useMemo, useState } from 'react';
import { countries, type Country } from './country-bounds';

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const countryIndex = countries.map(country => ({ country, names: [country[0], ...country[1]].map(normalize) }));

function matchCountries(query: string) {
  const exact: Country[] = [];
  const prefix: Country[] = [];
  const aliasPrefix: Country[] = [];
  const partial: Country[] = [];
  const term = normalize(query);

  if (term) {
    for (const { country, names } of countryIndex) {
      if (names.includes(term)) exact.push(country);
      else if (names[0].startsWith(term)) prefix.push(country);
      else if (names.some(name => name.startsWith(term))) aliasPrefix.push(country);
      else if (names.some(name => name.includes(term))) partial.push(country);
    }
  }

  const prefixes = [...prefix, ...aliasPrefix];
  return {
    suggestions: [...exact, ...prefixes, ...partial],
    bestMatches: exact.length ? exact : prefixes.length ? prefixes : partial,
  };
}

export function CountrySearch({ onSelect }: { onSelect: (country: Country) => boolean }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const id = useId();
  const listId = `${id}-countries`;
  const feedbackId = `${id}-feedback`;
  const { suggestions, bestMatches } = useMemo(() => matchCountries(query), [query]);
  const expanded = showSuggestions && suggestions.length > 0 && !error;
  const activeId = expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  function closeSuggestions() {
    setShowSuggestions(false);
    setActiveIndex(-1);
  }

  function selectCountry(country: Country) {
    closeSuggestions();
    if (!onSelect(country)) {
      setError('The map is still loading. Try again in a moment.');
      return;
    }
    setQuery(country[0]);
    setError('');
    setStatus(`Map centered on ${country[0]}.`);
  }

  return (
    <form className="country-search" role="search" aria-label="Find a country on the map"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeSuggestions();
      }}
      onSubmit={event => {
        event.preventDefault();
        if (expanded && activeIndex >= 0) {
          selectCountry(suggestions[activeIndex]);
        } else if (bestMatches.length === 1) {
          selectCountry(bestMatches[0]);
        } else if (suggestions.length) {
          setError('');
          setShowSuggestions(true);
          setActiveIndex(0);
        } else {
          setError('No matching country. Try another name.');
        }
      }}>
      <div className="country-search-field">
        <input type="search" role="combobox" aria-label="Search for a country" autoComplete="off" required
          placeholder="Find a country" value={query} aria-describedby={error ? feedbackId : undefined}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-activedescendant={activeId}
          onFocus={() => setShowSuggestions(true)}
          onChange={event => {
            setQuery(event.target.value);
            setError('');
            setStatus('');
            setActiveIndex(-1);
            setShowSuggestions(true);
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape' && expanded) {
              event.preventDefault();
              closeSuggestions();
            } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
              event.preventDefault();
              setError('');
              setShowSuggestions(true);
              setActiveIndex(index => {
                if (event.key === 'ArrowDown') return Math.min(index + 1, suggestions.length - 1);
                return index < 0 ? suggestions.length - 1 : Math.max(index - 1, 0);
              });
            }
          }} />
        <button type="submit" aria-label="Go to country" title="Go to country">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" />
          </svg>
        </button>
      </div>
      <ul className="country-search-suggestions" id={listId} role="listbox" aria-label="Country suggestions" hidden={!expanded}>
        {expanded && suggestions.map((country, index) => (
          <li id={`${listId}-${index}`} key={country[0]} role="option" aria-selected={index === activeIndex}
            onMouseDown={event => event.preventDefault()} onClick={() => selectCountry(country)}>
            {country[0]}
          </li>
        ))}
      </ul>
      {error && <p className="country-search-feedback" id={feedbackId} role="status">{error}</p>}
      <span className="country-search-status" role="status">{status}</span>
    </form>
  );
}
