import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Heart } from 'lucide-react';
import { CATEGORIES } from '../utils/constants.js';
import { formatNaira, timeAgo } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { addFavourite, removeFavourite } from '../services/userService.js';
import { resolveImageUrl } from '../utils/imageUrl.js';
import VerifiedBusinessBadge from './VerifiedBusinessBadge.jsx';

export default function ProductCard({ ad, initiallySaved = false, onUnsave }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { isAuthenticated, favoriteIds, favoritesLoaded, setFavorite } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const categorySlug = ad.category?.slug || ad.category_slug;
  const Icon = CATEGORIES.find((c) => c.slug === categorySlug)?.icon;
  const image = ad.images?.[0] || ad.image;
  const condition = ad.condition_type || ad.condition;
  const sellerName = ad.seller?.name || ad.seller_name || ad.seller;
  const postedAt = ad.created_at || ad.postedAt;
  const saved = favoriteIds.includes(String(ad.id)) || (!favoritesLoaded && initiallySaved);

  const toggleSaved = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (saved) {
        await removeFavourite(ad.id);
        setFavorite(ad.id, false);
        onUnsave?.(ad.id);
      } else {
        await addFavourite(ad.id);
        setFavorite(ad.id, true);
      }
    } catch (error) {
      setSaveError(error.response?.data?.message || 'Could not update saved products.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card">
      <Link to={`/ads/${ad.id}`} className="card-media" aria-label={ad.title}>
        {image ? <img src={resolveImageUrl(image)} alt={ad.title} loading="lazy" /> : Icon && <Icon size={44} strokeWidth={1.5} aria-hidden="true" />}
        <span className={`tag ${condition === 'new' || condition === 'New' ? 'tag-new' : 'tag-used'}`}>{condition}</span>
        {(ad.is_featured || ad.featured) && <span className="tag tag-feat">Featured</span>}
      </Link>
      <button type="button" className={`card-fav ${saved ? 'saved' : ''} ${saving ? 'saving' : ''}`} aria-label={saved ? 'Remove from saved products' : 'Save advert'} aria-pressed={saved} disabled={saving} onClick={toggleSaved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>
      <div className="card-body">
        <p className="card-price">{formatNaira(ad.price)}</p>
        <h3 className="card-title"><Link to={`/ads/${ad.id}`}>{ad.title}</Link></h3>
        <p className="card-meta"><MapPin size={14} aria-hidden="true" /> {ad.city}, {ad.state}</p>
        <p className="card-foot">
          <span className="seller">{sellerName} <VerifiedBusinessBadge verified={Boolean(ad.seller?.is_verified || ad.verified)} /></span>
          <time dateTime={postedAt}>{timeAgo(postedAt)}</time>
        </p>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
      </div>
    </article>
  );
}
