import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Heart, Star } from 'lucide-react';
import { CATEGORIES, FALLBACK_CATEGORY_IMAGE } from '../utils/constants.js';
import { formatNaira, timeAgo } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { addFavourite, removeFavourite } from '../services/userService.js';
import { trackSponsoredAd } from '../services/listingService.js';
import { resolveImageUrl } from '../utils/imageUrl.js';
import VerifiedBusinessBadge from './VerifiedBusinessBadge.jsx';
import ImageWithFallback from './ImageWithFallback.jsx';

export default function ProductCard({ ad, initiallySaved = false, onUnsave }) {
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState(false);
  const { favoriteIds, favoritesLoaded, setFavorite } = useAuth();
  const categorySlug = ad.category?.slug || ad.category_slug;
  const category = CATEGORIES.find((item) => item.slug === categorySlug);
  const categoryImage = category?.image || FALLBACK_CATEGORY_IMAGE;
  const image = ad.images?.[0] || ad.image;
  const imageSource = image ? resolveImageUrl(image) : categoryImage;
  const condition = ad.condition_type || ad.condition;
  const sellerName = ad.seller?.name || ad.seller_name || ad.seller;
  const postedAt = ad.created_at || ad.postedAt;
  const saved = favoriteIds.includes(String(ad.id)) || (!favoritesLoaded && initiallySaved);
  const sponsored = Boolean(ad.is_sponsored);

  useEffect(() => {
    if (!sponsored || !cardRef.current || !('IntersectionObserver' in window)) return undefined;
    let tracked = false;
    const observer = new IntersectionObserver((entries) => {
      if (!tracked && entries.some((entry) => entry.isIntersecting)) {
        tracked = true;
        trackSponsoredAd(ad.id, 'impression').catch(() => {});
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [ad.id, sponsored]);

  const trackClick = () => {
    if (sponsored) trackSponsoredAd(ad.id, 'click').catch(() => {});
  };

  const toggleSaved = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (saved) {
        await removeFavourite(ad.id);
        setFavorite(ad.id, false);
        setSaveNotice(false);
        onUnsave?.(ad.id);
      } else {
        await addFavourite(ad.id, ad);
        setFavorite(ad.id, true);
        setSaveNotice(true);
      }
    } catch (error) {
      setSaveError(error.response?.data?.message || 'Could not update saved products.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card" ref={cardRef}>
      <Link to={`/ads/${ad.id}`} className="card-media" aria-label={ad.title} onClick={trackClick}>
        <ImageWithFallback
          key={`${imageSource}:${categorySlug || ''}`}
          className="product-photo"
          src={imageSource}
          fallbackSrc={categoryImage}
          alt={image ? ad.title : `${category?.name || 'Renewable energy'} category image`}
          loading="lazy"
          decoding="async"
        />
        <span className={`tag ${condition === 'new' || condition === 'New' ? 'tag-new' : 'tag-used'}`}>{condition}</span>
        {sponsored ? <span className="tag tag-feat">Sponsored</span> : (ad.is_featured || ad.featured) && <span className="tag tag-feat">Featured</span>}
      </Link>
      <button type="button" className={`card-fav ${saved ? 'saved' : ''} ${saving ? 'saving' : ''}`} aria-label={saved ? 'Remove from saved products' : 'Save advert'} aria-pressed={saved} disabled={saving} onClick={toggleSaved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>
      <div className="card-body">
        <p className="card-price">{formatNaira(ad.price)}</p>
        <h3 className="card-title"><Link to={`/ads/${ad.id}`} onClick={trackClick}>{ad.title}</Link></h3>
        <p className="card-meta"><MapPin size={14} aria-hidden="true" /><span>{ad.city}, {ad.state}</span></p>
        {ad.seller?.rating?.count > 0 && <p className="card-rating" aria-label={`Seller rated ${ad.seller.rating.average.toFixed(1)} out of 5 from ${ad.seller.rating.count} ratings`}><Star size={14} fill="currentColor" aria-hidden="true" /><strong>{ad.seller.rating.average.toFixed(1)}</strong><span>({ad.seller.rating.count})</span></p>}
        <p className="card-foot">
          <span className="seller"><span className="card-seller-name">{sellerName}</span><VerifiedBusinessBadge verified={Boolean(ad.seller?.is_verified || ad.verified)} /></span>
          <time dateTime={postedAt}>{timeAgo(postedAt)}</time>
        </p>
        {saveNotice && <p className="card-save-notice" role="status">Saved. <Link to="/saved">View wishlist</Link></p>}
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
      </div>
    </article>
  );
}
