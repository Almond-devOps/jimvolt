import { useEffect, useState } from 'react';
import { BadgeCheck, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getVerifiedSellers } from '../services/listingService.js';
import UserAvatar from '../components/UserAvatar.jsx';

export default function SellersPage() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getVerifiedSellers()
      .then((result) => active && setSellers(result))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load verified sellers.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <div className="container section">
      <header className="section-head"><div><p className="eyebrow">Shop with confidence</p><h1>Verified sellers</h1><p className="muted">Businesses verified by Jimvolt, with active renewable energy listings.</p></div></header>
      {error && <div className="alert" role="alert">{error}</div>}
      {loading ? <div className="grid" role="status" aria-label="Loading verified sellers">{Array.from({ length: 6 }, (_, i) => <div key={i} className="shimmer" style={{ height: 150 }} />)}</div> : !sellers.length ? <div className="empty">No verified sellers with active listings yet.</div> : (
        <div className="sellers sellers-page-grid">{sellers.map((seller) => (
          <Link className="seller-card" key={seller.id} to={`/sellers/${seller.id}`}>
            <UserAvatar src={seller.profileImage} name={seller.name} className="avatar" />
            <span><strong>{seller.name} <BadgeCheck size={16} className="ok" /></strong><small><MapPin size={13} /> {seller.state} · {seller.ads} active adverts</small></span>
          </Link>
        ))}</div>
      )}
    </div>
  );
}
