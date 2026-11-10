import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getAd, sendSellerMessage } from '../services/listingService.js';
import { startConversation } from '../services/messageService.js';
import { addFavourite, removeFavourite } from '../services/userService.js';
import { formatNaira, timeAgo } from '../utils/format.js';
import { resolveImageUrl } from '../utils/imageUrl.js';
import VerifiedBusinessBadge from '../components/VerifiedBusinessBadge.jsx';
import UserAvatar from '../components/UserAvatar.jsx';

export default function AdDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, favoriteIds, favoritesLoaded, setFavorite } = useAuth();
  const [advertisement, setAdvertisement] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAd(id)
      .then((result) => {
        if (!active) return;
        setAdvertisement(result);
        try {
          const current = JSON.parse(localStorage.getItem('jimvolt_recently_viewed') || '[]');
          const next = [
            { advertisement: result, viewedAt: new Date().toISOString() },
            ...current.filter((item) => String(item.advertisement?.id) !== String(result.id)),
          ].slice(0, 40);
          localStorage.setItem('jimvolt_recently_viewed', JSON.stringify(next));
        } catch (storageError) {
          console.error('Could not update local browsing history:', storageError.message);
        }
      })
      .catch((error) => active && setNotice({ type: 'error', text: error.response?.data?.message || 'This advert could not be loaded.' }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (favoritesLoaded) setSaved(favoriteIds.includes(String(id)));
  }, [favoriteIds, favoritesLoaded, id]);

  const toggleSaved = async () => {
    if (!isAuthenticated) return navigate('/login', { state: { from: `/ads/${id}` } });
    try {
      if (saved) {
        await removeFavourite(id);
        setSaved(false);
        setFavorite(id, false);
      } else {
        await addFavourite(id);
        setSaved(true);
        setFavorite(id, true);
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update saved products.' });
    }
  };

  const contactSeller = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) return navigate('/login', { state: { from: `/ads/${id}` } });
    setSending(true);
    setNotice(null);
    try {
      const { data } = await sendSellerMessage({ advertisementId: Number(id), message });
      setMessage('');
      setNotice({ type: 'success', text: data.message });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Your message could not be sent.' });
    } finally {
      setSending(false);
    }
  };

  const chatWithSeller = async () => {
    if (!isAuthenticated) return navigate('/login', { state: { from: `/ads/${id}` } });
    setOpeningChat(true);
    setNotice(null);
    try {
      const { data } = await startConversation(Number(id));
      navigate(`/messages?conversation=${data.conversation.id}`);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Could not open a conversation with this seller.' });
    } finally {
      setOpeningChat(false);
    }
  };

  if (loading) return <div className="container section"><div className="shimmer" style={{ height: 420 }} role="status" aria-label="Loading advertisement" /></div>;
  if (!advertisement) return <div className="container section"><div className="alert" role="alert">{notice?.text || 'Advertisement not found.'}</div><Link className="link" to="/ads">Browse advertisements</Link></div>;

  const images = advertisement.images || (advertisement.image ? [advertisement.image] : []);
  const seller = advertisement.seller || {};
  const phoneDigits = String(seller.phone || advertisement.phone || '').replace(/\D/g, '');

  return (
    <div className="container section">
      <Link to="/ads" className="link detail-back"><ArrowLeft size={16} /> Back to adverts</Link>
      {notice && <div className={`notice ${notice.type}`} role="status">{notice.text}</div>}
      <div className="detail-layout">
        <section>
          <div className="detail-image">
            {images.length ? <img src={resolveImageUrl(images[imageIndex])} alt={advertisement.title} /> : <div className="detail-image-empty">No product photo available</div>}
          </div>
          {images.length > 1 && <div className="detail-thumbnails">{images.map((image, index) => <button key={image} type="button" className={index === imageIndex ? 'selected' : ''} onClick={() => setImageIndex(index)}><img src={resolveImageUrl(image)} alt={`Product view ${index + 1}`} /></button>)}</div>}
          <article className="panel detail-description">
            <h2>Product description</h2>
            <p>{advertisement.description}</p>
            <div className="detail-facts">
              {advertisement.brand && <span>Brand: <strong>{advertisement.brand}</strong></span>}
              <span>Condition: <strong>{advertisement.condition_type}</strong></span>
              <span>Category: <strong>{advertisement.category?.name}</strong></span>
              <span>Listed: <strong>{timeAgo(advertisement.created_at)}</strong></span>
            </div>
            {advertisement.specifications && <div className="detail-specifications"><h3>Specifications</h3><p>{advertisement.specifications}</p></div>}
          </article>
        </section>
        <aside className="detail-aside">
          <div className="panel detail-summary">
            <p className="eyebrow">{advertisement.category?.name}</p>
            <h1>{advertisement.title}</h1>
            <p className="detail-price">{formatNaira(advertisement.price)}</p>
            <p className="card-meta"><MapPin size={16} /> {advertisement.city}, {advertisement.state}</p>
            <button type="button" className={`btn ${saved ? 'btn-white' : 'btn-primary'} detail-save`} onClick={toggleSaved}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save advert'}</button>
          </div>
          <div className="panel seller-panel">
            <div className="seller-profile">
              <UserAvatar src={seller.profileImage} name={seller.name} className="avatar" />
              <div><strong>{seller.name || 'Seller'}</strong><p className="muted">{seller.is_verified ? <VerifiedBusinessBadge verified /> : 'Jimvolt marketplace seller'}</p></div>
            </div>
            <p className="seller-trust"><ShieldCheck size={16} /> Keep conversations on Jimvolt and inspect items before payment.</p>
            <button type="button" className="btn btn-primary full-width" onClick={chatWithSeller} disabled={openingChat}>
              <MessageCircle size={17} /> {openingChat ? 'Opening chat...' : 'Chat with Seller'}
            </button>
            {phoneDigits && <a className="btn btn-white full-width" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Chat on WhatsApp</a>}
            <form onSubmit={contactSeller} className="message-form">
              <label className="field"><span>Message the seller</span><textarea rows="4" maxLength="2000" required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Hi, is this product still available?" /></label>
              <button type="submit" className="btn btn-primary full-width" disabled={sending}>{sending ? 'Sending...' : 'Send message'}</button>
              {!isAuthenticated && <p className="muted">Sign in to message the seller.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
