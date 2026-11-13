import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MapPin, Share2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { clearFavourites, getFavourites, getWishlistPreferences, removeFavouriteEntry, updateWishlistPreferences } from '../services/userService.js';
import { getCategories } from '../services/listingService.js';
import { startConversation } from '../services/messageService.js';
import { formatNaira, timeAgo } from '../utils/format.js';
import { resolveImageUrl } from '../utils/imageUrl.js';

const pageSize = 12;

export default function FavouritesPage() {
  const { refreshFavorites, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [preferences, setPreferences] = useState({ notifyPriceDrops: true });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getFavourites({
        page, limit: pageSize, q: query.trim(), category: category || undefined, sort,
      });
      setFavorites(data.favorites || []);
      setPages(Math.max(1, data.pagination?.pages || 1));
      setTotal(Number(data.pagination?.total || 0));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load saved products.');
    } finally {
      setLoading(false);
    }
  }, [page, query, category, sort, isAuthenticated]);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);
  useEffect(() => {
    let active = true;
    Promise.all([getCategories(), getWishlistPreferences()])
      .then(([categoryResult, preferenceResult]) => {
        if (!active) return;
        setCategories(categoryResult);
        setPreferences({ notifyPriceDrops: Boolean(preferenceResult.data.notifyPriceDrops) });
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Could not load wishlist settings.');
      });
    return () => { active = false; };
  }, [isAuthenticated]);

  const remove = async (favoriteId) => {
    try {
      await removeFavouriteEntry(favoriteId);
      setNotice('Product removed from saved products.');
      await refreshFavorites();
      await loadFavorites();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not remove this product.');
    }
  };

  const clearAll = async () => {
    if (!total || !window.confirm('Remove all products from your saved list?')) return;
    try {
      await clearFavourites();
      setFavorites([]);
      setTotal(0);
      setPages(1);
      setPage(1);
      setNotice('Your saved products have been cleared.');
      await refreshFavorites();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not clear saved products.');
    }
  };

  const togglePriceAlerts = async (event) => {
    const notifyPriceDrops = event.target.checked;
    setPreferences({ notifyPriceDrops });
    try {
      await updateWishlistPreferences({ notifyPriceDrops });
    } catch (requestError) {
      setPreferences({ notifyPriceDrops: !notifyPriceDrops });
      setError(requestError.response?.data?.message || 'Could not update price alert settings.');
    }
  };

  const share = async (favorite) => {
    const url = `${window.location.origin}/ads/${favorite.advertisement_id}`;
    try {
      if (navigator.share) await navigator.share({ title: favorite.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice('Advertisement link copied.');
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError('Could not share this advertisement.');
    }
  };

  const chat = async (favorite) => {
    if (!isAuthenticated) return navigate('/login', { state: { from: '/saved' } });
    try {
      const { data } = await startConversation(Number(favorite.advertisement_id));
      window.location.assign(`/messages?conversation=${data.conversation.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not open a conversation with the seller.');
    }
  };

  return (
    <div className="container section">
      <div className="section-head">
        <div><p className="eyebrow">{isAuthenticated ? 'Your account' : 'Your wishlist'}</p><h1>Saved products</h1><p className="muted">Keep track of renewable products you want to revisit.</p></div>
        {!!total && <button className="btn btn-outline" type="button" onClick={clearAll}><Trash2 size={16} /> Clear all</button>}
      </div>
      <div className="saved-toolbar">
        <label className="field"><span>Search saved products</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Product or seller" /></label>
        <label className="field"><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="newest">Recently saved</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option></select></label>
      </div>
      {!isAuthenticated && <p className="notice info">Your wishlist is saved in this browser. <Link to="/login">Sign in</Link> to use your account wishlist.</p>}
      {isAuthenticated && <label className="saved-preference"><input type="checkbox" checked={preferences.notifyPriceDrops} onChange={togglePriceAlerts} /> Notify me when a saved product's price drops</label>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading && <div className="grid">{Array.from({ length: 4 }, (_, index) => <div className="card loading-card" key={index} aria-hidden="true" />)}</div>}
      {!loading && !error && !favorites.length && <EmptyState title="No saved products yet" text="Tap the heart on any advert to save it here." action={<Link className="btn btn-primary" to="/ads">Browse adverts</Link>} />}
      {!loading && !!favorites.length && (
        <div className="saved-grid">
          {favorites.map((item) => (
            <article className={`saved-card ${!item.available ? 'unavailable' : ''}`} key={item.favorite_id}>
              <Link className="saved-card-image" to={item.advertisement_id ? `/ads/${item.advertisement_id}` : '/ads'}>{item.image ? <img src={resolveImageUrl(item.image)} alt={item.title} loading="lazy" /> : <span className="muted">No product photo</span>}</Link>
              <div className="saved-card-body">
                {!item.available && <span className="availability-tag">{String(item.unavailableReason || 'unavailable').replaceAll('_', ' ')}</span>}
                <p className="card-price">{item.price == null ? 'Price unavailable' : formatNaira(item.price)}</p>
                <h2><Link to={item.advertisement_id ? `/ads/${item.advertisement_id}` : '/ads'}>{item.title}</Link></h2>
                <p className="card-meta"><MapPin size={14} /> {[item.city, item.state].filter(Boolean).join(', ') || 'Location unavailable'}</p>
                <p className="muted">{item.condition_type ? `${item.condition_type} condition` : 'Condition unavailable'}</p>
                <p className="muted">{item.seller_name || 'Seller unavailable'} · Saved {timeAgo(item.favorited_at)}</p>
                <div className="saved-card-actions">
                  {item.available && <button className="btn btn-primary" type="button" onClick={() => chat(item)}>Chat with seller</button>}
                  {item.advertisement_id && <button className="icon-btn" type="button" onClick={() => share(item)} aria-label="Share advertisement"><Share2 size={17} /></button>}
                  <button className="icon-btn" type="button" onClick={() => remove(item.favorite_id)} aria-label="Remove from saved products"><Heart size={17} fill="currentColor" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && pages > 1 && <div className="pagination"><button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn btn-outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
    </div>
  );
}
