import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Trash2 } from 'lucide-react';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { clearRecentlyViewed, getRecentlyViewed, importRecentlyViewed, removeRecentlyViewed } from '../services/userService.js';
import { formatNaira, timeAgo } from '../utils/format.js';
import { resolveImageUrl } from '../utils/imageUrl.js';

const storageKey = 'jimvolt_recently_viewed';
const pageSize = 12;

function readLocalHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(items) ? items.filter((item) => item?.advertisement?.id) : [];
  } catch (error) {
    console.error('Could not read local browsing history:', error.message);
    return [];
  }
}

export default function RecentlyViewedPage() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [localItems, setLocalItems] = useState(readLocalHistory);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(isAuthenticated);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await getRecentlyViewed({ page, limit: pageSize });
      setItems(data.items || []);
      setPages(Math.max(1, data.pagination?.pages || 1));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load recently viewed products.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, page]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const importHistory = async () => {
    if (!localItems.length || !window.confirm(`Add ${localItems.length} locally viewed product(s) to your account?`)) return;
    setImporting(true);
    setError('');
    try {
      const ids = localItems.map((item) => Number(item.advertisement.id));
      const { data } = await importRecentlyViewed(ids);
      localStorage.removeItem(storageKey);
      setLocalItems([]);
      setPage(1);
      setNotice(`${data.imported} product(s) added to your account history.`);
      await loadHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not import browsing history.');
    } finally {
      setImporting(false);
    }
  };

  const remove = async (item) => {
    if (isAuthenticated) {
      try {
        await removeRecentlyViewed(item.advertisement_id);
        await loadHistory();
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Could not remove this product.');
      }
      return;
    }
    const id = item.advertisement.id;
    const next = localItems.filter((entry) => String(entry.advertisement.id) !== String(id));
    localStorage.setItem(storageKey, JSON.stringify(next));
    setLocalItems(next);
  };

  const clearHistory = async () => {
    const count = isAuthenticated ? items.length : localItems.length;
    if (!count || !window.confirm('Clear your recently viewed products?')) return;
    if (isAuthenticated) {
      try {
        await clearRecentlyViewed();
        setItems([]);
        setPages(1);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Could not clear your history.');
        return;
      }
    }
    localStorage.removeItem(storageKey);
    setLocalItems([]);
    setNotice('Recently viewed products cleared.');
  };

  const visibleItems = isAuthenticated ? items : localItems.map((entry) => ({
    id: entry.advertisement.id,
    advertisement_id: entry.advertisement.id,
    viewed_at: entry.viewedAt,
    title: entry.advertisement.title,
    price: entry.advertisement.price,
    city: entry.advertisement.city,
    state: entry.advertisement.state,
    seller_name: entry.advertisement.seller?.name || entry.advertisement.seller_name,
    image: entry.advertisement.images?.[0] || entry.advertisement.image,
    available: entry.advertisement.status === 'approved' || !entry.advertisement.status,
    local: true,
  }));
  const currentCount = isAuthenticated ? items.length : localItems.length;

  return (
    <div className="container section">
      <div className="section-head">
        <div><p className="eyebrow">Your account</p><h1>Recently viewed</h1><p className="muted">Pick up where you left off.</p></div>
        {!!currentCount && <button className="btn btn-outline" type="button" onClick={clearHistory}><Trash2 size={16} /> Clear history</button>}
      </div>
      {isAuthenticated && localItems.length > 0 && <div className="notice info history-import"><span>You have {localItems.length} product(s) saved in this browser from before you signed in.</span><button className="btn btn-primary" type="button" disabled={importing} onClick={importHistory}>{importing ? 'Importing...' : 'Import to my account'}</button></div>}
      {!isAuthenticated && localItems.length > 0 && <p className="notice info">This temporary history is stored only in this browser. <Link to="/login" state={{ from: '/recently-viewed' }}>Sign in</Link> to sync it with your account.</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading && <div className="grid">{Array.from({ length: 4 }, (_, index) => <div className="card loading-card" key={index} aria-hidden="true" />)}</div>}
      {!loading && !visibleItems.length && <EmptyState title="Nothing viewed recently" text="Products you visit will appear here so you can find them again." action={<Link className="btn btn-primary" to="/ads">Browse adverts</Link>} />}
      {!loading && !!visibleItems.length && (
        <div className="saved-grid">
          {visibleItems.map((item) => (
            <article className={`saved-card ${!item.available ? 'unavailable' : ''}`} key={item.id}>
              <Link className="saved-card-image" to={`/ads/${item.advertisement_id}`}>{item.image ? <img src={resolveImageUrl(item.image)} alt={item.title} loading="lazy" /> : <span className="muted">No product photo</span>}</Link>
              <div className="saved-card-body">
                {!item.available && <span className="availability-tag">Unavailable</span>}
                <p className="card-price">{item.price == null ? 'Price unavailable' : formatNaira(item.price)}</p>
                <h2><Link to={`/ads/${item.advertisement_id}`}>{item.title}</Link></h2>
                <p className="card-meta"><MapPin size={14} /> {[item.city, item.state].filter(Boolean).join(', ') || 'Location unavailable'}</p>
                <p className="muted">{item.seller_name || 'Seller unavailable'} · Viewed {timeAgo(item.viewed_at)}</p>
                <div className="saved-card-actions"><Link className="btn btn-primary" to={`/ads/${item.advertisement_id}`}>View product</Link><button className="icon-btn" type="button" onClick={() => remove(item)} aria-label="Remove from recently viewed"><Trash2 size={17} /></button></div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && isAuthenticated && pages > 1 && <div className="pagination"><button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={15} /> Previous</button><span>Page {page} of {pages}</span><button className="btn btn-outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
    </div>
  );
}
