import { useEffect, useMemo, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AdFilterSidebar from '../components/AdFilterSidebar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { getAds, getCategories } from '../services/listingService.js';
import { formatNaira } from '../utils/format.js';

const filterKeys = ['category', 'state', 'city', 'minPrice', 'maxPrice', 'condition', 'verified', 'featured', 'recently'];
const initialDraft = {
  category: '', state: '', city: '', minPrice: '', maxPrice: '',
  condition: '', verified: '', featured: '', recently: '',
};

function draftFromParams(searchParams) {
  return filterKeys.reduce((draft, key) => {
    draft[key] = searchParams.get(key) || '';
    return draft;
  }, { ...initialDraft });
}

function SearchSkeletons() {
  return <div className="grid">{Array.from({ length: 8 }, (_, index) => <div key={index} className="card skeleton" aria-hidden="true" />)}</div>;
}

export default function AdsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoriesError, setCategoriesError] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFromParams(searchParams));

  const query = useMemo(() => {
    const params = Object.fromEntries(searchParams.entries());
    params.limit = '20';
    params.page ||= '1';
    params.sort ||= 'newest';
    return JSON.stringify(params);
  }, [searchParams]);

  useEffect(() => {
    setDraft(draftFromParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    getCategories()
      .then((result) => active && setCategories(result))
      .catch((requestError) => active && setCategoriesError(requestError.response?.data?.message || 'Categories could not be loaded.'))
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAds(JSON.parse(query))
      .then((response) => {
        if (!active) return;
        setItems(response.advertisements || []);
        setPagination(response.pagination || { page: 1, limit: 20, total: 0, pages: 0 });
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Unable to load advertisements right now.');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [query]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    const currentQuery = searchParams.get('q')?.trim();
    if (currentQuery) params.set('q', currentQuery);
    for (const key of filterKeys) {
      if (draft[key]) params.set(key, draft[key]);
    }
    params.set('sort', searchParams.get('sort') || 'newest');
    params.set('page', '1');
    params.set('limit', '20');
    setSearchParams(params);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    const currentQuery = searchParams.get('q')?.trim();
    if (currentQuery) params.set('q', currentQuery);
    params.set('sort', searchParams.get('sort') || 'newest');
    params.set('page', '1');
    params.set('limit', '20');
    setSearchParams(params);
    setDraft(initialDraft);
  };

  const updateQuery = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    next.set('limit', '20');
    setSearchParams(next);
  };

  const activeFilters = filterKeys
    .filter((key) => searchParams.get(key))
    .map((key) => {
      const value = searchParams.get(key);
      if (key === 'category') return { key, label: categories.find((category) => category.slug === value)?.name || value };
      if (key === 'minPrice') return { key, label: `From ${formatNaira(value)}` };
      if (key === 'maxPrice') return { key, label: `Up to ${formatNaira(value)}` };
      if (key === 'condition') return { key, label: value === 'new' ? 'New' : 'Used' };
      if (key === 'verified') return { key, label: value === 'true' ? 'Verified sellers' : 'Not verified' };
      if (key === 'featured') return { key, label: value === 'true' || value === '1' ? 'Featured' : 'Not featured' };
      if (key === 'recently') return { key, label: 'Posted in the last 7 days' };
      return { key, label: value };
    });

  const selectedFilterCount = activeFilters.length;
  const searchTerm = searchParams.get('q')?.trim() || '';

  return (
    <div className="container section search-results-page">
      <header className="search-results-heading">
        <div>
          <p className="eyebrow">{searchTerm ? 'Search results' : 'Renewable energy marketplace'}</p>
          <h1>{searchTerm ? `Results for “${searchTerm}”` : 'Browse products and services'}</h1>
          <p className="muted">{loading ? <span className="shimmer shimmer-line" style={{ width: 220 }} role="status" aria-label="Searching approved advertisements" /> : `${pagination.total.toLocaleString()} matching ${pagination.total === 1 ? 'advertisement' : 'advertisements'}`}</p>
        </div>
        <div className="search-results-actions">
          <button type="button" className="btn btn-white mobile-filter-button" aria-expanded={mobileFiltersOpen} aria-controls="advertisement-filters" onClick={() => setMobileFiltersOpen(true)}><Filter size={17} /> Filters{selectedFilterCount > 0 && <span className="filter-count">{selectedFilterCount}</span>}</button>
          <label className="sort-control"><span>Sort by</span><select value={searchParams.get('sort') || 'newest'} onChange={(event) => updateQuery('sort', event.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_asc">Lowest price</option>
            <option value="price_desc">Highest price</option>
            <option value="most_viewed">Most viewed</option>
            <option value="popular">Most popular</option>
          </select></label>
        </div>
      </header>

      {categoriesError && <p className="notice error" role="alert">{categoriesError}</p>}

      <div className="search-results-layout">
        <AdFilterSidebar
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          onApply={applyFilters}
          onClear={clearFilters}
          mobileOpen={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
        />
        <section className="search-results-content" aria-label="Search results" aria-busy={loading}>
          {(searchTerm || activeFilters.length > 0) && <div className="active-filters">
            {searchTerm && <button type="button" className="filter-chip" onClick={() => updateQuery('q', '')}>Search: {searchTerm} <X size={14} /></button>}
            {activeFilters.map(({ key, label }) => <button type="button" className="filter-chip" key={key} onClick={() => updateQuery(key, '')}>{label} <X size={14} /></button>)}
            {selectedFilterCount > 0 && <button type="button" className="clear-filter-link" onClick={clearFilters}>Clear filters</button>}
          </div>}

          {error && <div className="notice error" role="alert">{error}</div>}
          {loading ? <SearchSkeletons /> : !error && items.length === 0 ? <EmptyState
            title={searchTerm ? `No products found for “${searchTerm}”` : 'No advertisements match these filters'}
            text={searchTerm ? 'Try another product name, brand, specification, or category. You can also remove filters to broaden your search.' : 'Try widening your price range, choosing another location, or clearing some filters.'}
            action={<button type="button" className="btn btn-primary" onClick={clearFilters}>Clear filters</button>}
          /> : !error && <>
            <div className="grid">{items.map((ad) => <ProductCard key={ad.id} ad={ad} />)}</div>
            {pagination.pages > 1 && <nav className="pagination" aria-label="Search result pages">
              <button type="button" className="btn btn-white" disabled={pagination.page <= 1} onClick={() => updateQuery('page', String(pagination.page - 1))}>Previous</button>
              <span>Page {pagination.page} of {pagination.pages}</span>
              <button type="button" className="btn btn-white" disabled={pagination.page >= pagination.pages} onClick={() => updateQuery('page', String(pagination.page + 1))}>Next</button>
            </nav>}
          </>}
        </section>
      </div>
    </div>
  );
}
