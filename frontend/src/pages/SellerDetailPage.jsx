import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import VerifiedBusinessBadge from '../components/VerifiedBusinessBadge.jsx';
import { getSeller } from '../services/listingService.js';
import UserAvatar from '../components/UserAvatar.jsx';
import SellerRating from '../components/SellerRating.jsx';

export default function SellerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSeller(id)
      .then((result) => active && setData(result))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load this seller.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="container section"><div className="shimmer" style={{ height: 260 }} role="status" aria-label="Loading seller" /></div>;
  if (error || !data) return <div className="container section"><div className="alert" role="alert">{error || 'Seller not found.'}</div><Link className="link" to="/sellers">Browse verified sellers</Link></div>;

  return (
    <div className="container section">
      <header className="seller-detail-header panel">
        <UserAvatar src={data.seller.profileImage} name={data.seller.name} className="avatar" />
        <div><p className="eyebrow">Jimvolt seller</p><h1>{data.seller.name} <VerifiedBusinessBadge verified={Boolean(data.seller.isVerified)} /></h1><p className="muted">{data.seller.isVerified ? 'Verified seller' : 'Seller'} · Member since {new Date(data.seller.createdAt).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}</p></div>
      </header>
      <SellerRating sellerId={id} />
      <div className="section-head"><div><h2>Active advertisements</h2><p className="muted">{data.advertisements.length} active listings</p></div></div>
      {data.advertisements.length ? <div className="grid">{data.advertisements.map((ad) => <ProductCard key={ad.id} ad={ad} />)}</div> : <EmptyState title="No active advertisements" text="This seller does not have any approved listings right now." />}
    </div>
  );
}
