import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { getCitiesForState as getAvailableCities } from '../services/listingService.js';
import { getCitiesForState } from '../utils/nigerianLocations.js';
import { NIGERIAN_STATES } from '../utils/constants.js';

export default function AdFilterSidebar({ draft, setDraft, categories, onApply, onClear, mobileOpen, onClose }) {
  const [availableCities, setAvailableCities] = useState([]);
  const [locationError, setLocationError] = useState('');
  const [priceError, setPriceError] = useState('');
  const sidebarRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const cityOptions = useMemo(
    () => getCitiesForState(draft.state, availableCities),
    [draft.state, availableCities],
  );

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousFocus = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousScrollY = window.scrollY;
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () => [...(sidebarRef.current?.querySelectorAll(focusableSelector) || [])]
      .filter((element) => element.getClientRects().length > 0);

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (!focusableElements.length) {
        event.preventDefault();
        sidebarRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      window.scrollTo(0, previousScrollY);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!draft.state) {
      setAvailableCities([]);
      return undefined;
    }
    const controller = new AbortController();
    getAvailableCities(draft.state, controller.signal)
      .then(setAvailableCities)
      .catch((error) => {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          setLocationError('Saved city suggestions are unavailable; you can still type a city.');
        }
      });
    return () => controller.abort();
  }, [draft.state]);

  const update = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === 'state' ? { city: '' } : {}),
    }));
    if (key === 'minPrice' || key === 'maxPrice') setPriceError('');
  };

  const apply = (event) => {
    event.preventDefault();
    const min = draft.minPrice === '' ? null : Number(draft.minPrice);
    const max = draft.maxPrice === '' ? null : Number(draft.maxPrice);
    if (min !== null && max !== null && min > max) {
      setPriceError('Minimum price cannot be greater than maximum price.');
      return;
    }
    setPriceError('');
    onApply();
    onClose();
  };

  return (
    <>
      {mobileOpen && <div className="filter-backdrop" aria-hidden="true" onClick={onClose} />}
      <aside
        ref={sidebarRef}
        id="advertisement-filters"
        className={`filter-sidebar ${mobileOpen ? 'filter-sidebar-open' : ''}`}
        aria-label="Advertisement filters"
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? 'true' : undefined}
        aria-labelledby="filter-dialog-title"
        tabIndex={-1}
      >
        <div className="filter-sidebar-heading">
          <div><SlidersHorizontal size={18} /><h2 id="filter-dialog-title">Filters</h2></div>
          <button ref={closeRef} type="button" className="filter-close" onClick={onClose} aria-label="Close filters"><X size={20} /></button>
        </div>
        <form onSubmit={apply}>
          <section className="filter-group">
            <label htmlFor="filter-category">Category</label>
            <select id="filter-category" value={draft.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}
            </select>
          </section>

          <section className="filter-group">
            <label htmlFor="filter-state">State</label>
            <select id="filter-state" value={draft.state} onChange={(event) => update('state', event.target.value)}>
              <option value="">All Nigeria</option>
              {NIGERIAN_STATES.map((state) => <option value={state} key={state}>{state}</option>)}
            </select>
            <label htmlFor="filter-city">City / area</label>
            <input id="filter-city" list="filter-city-options" value={draft.city} disabled={!draft.state} onChange={(event) => update('city', event.target.value)} placeholder={draft.state ? 'All cities' : 'Choose a state first'} />
            <datalist id="filter-city-options">{cityOptions.map((city) => <option value={city} key={city} />)}</datalist>
            {locationError && <small className="filter-error">{locationError}</small>}
          </section>

          <section className="filter-group">
            <span className="filter-label">Price range (₦)</span>
            <div className="price-inputs">
              <label><span className="sr-only">Minimum price</span><input type="number" min="0" step="1000" inputMode="numeric" value={draft.minPrice} onChange={(event) => update('minPrice', event.target.value)} placeholder="Min" /></label>
              <span aria-hidden="true">to</span>
              <label><span className="sr-only">Maximum price</span><input type="number" min="0" step="1000" inputMode="numeric" value={draft.maxPrice} onChange={(event) => update('maxPrice', event.target.value)} placeholder="Max" /></label>
            </div>
            {priceError && <small className="filter-error" role="alert">{priceError}</small>}
          </section>

          <section className="filter-group">
            <label htmlFor="filter-condition">Condition</label>
            <select id="filter-condition" value={draft.condition} onChange={(event) => update('condition', event.target.value)}>
              <option value="">New and used</option><option value="new">New</option><option value="used">Used</option>
            </select>
          </section>

          <section className="filter-group">
            <label htmlFor="filter-verified">Seller verification</label>
            <select id="filter-verified" value={draft.verified} onChange={(event) => update('verified', event.target.value)}>
              <option value="">All sellers</option><option value="true">Verified sellers</option><option value="false">Not verified</option>
            </select>
          </section>

          <section className="filter-group filter-checks">
            <label><input type="checkbox" checked={draft.featured === 'true'} onChange={(event) => update('featured', event.target.checked ? 'true' : '')} /><span>Featured advertisements</span></label>
            <label><input type="checkbox" checked={draft.recently === 'true'} onChange={(event) => update('recently', event.target.checked ? 'true' : '')} /><span>Posted in the last 7 days</span></label>
          </section>

          <div className="filter-actions">
            <button type="submit" className="btn btn-primary"><Check size={16} /> Apply filters</button>
            <button type="button" className="btn btn-white" onClick={() => { onClear(); onClose(); }}>Clear filters</button>
          </div>
        </form>
      </aside>
    </>
  );
}
