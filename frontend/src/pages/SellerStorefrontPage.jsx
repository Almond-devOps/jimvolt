import { useEffect, useState } from 'react';
import { Globe2, MapPin, Phone, Store } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { getSellerStorefront } from '../services/sellerService.js';
import VerifiedBusinessBadge from '../components/VerifiedBusinessBadge.jsx';

export default function SellerStorefrontPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getSellerStorefront(slug)
      .then(({ data: result }) => active && setData(result))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load this seller storefront.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  if (loading) return <div className="container section"><div className="panel loading-card">Loading seller storefront...</div></div>;
  if (error || !data) return <div className="container section"><div className="notice error" role="alert">{error || 'Seller storefront not found.'}</div><Link className="link" to="/sellers">Browse sellers</Link></div>;

  const { seller, advertisements } = data;
  return <div className="container section public-business-page">
    <header className="panel public-business-header">
      {seller.logo_url ? <img className="public-business-logo" src={seller.logo_url} alt={`${seller.business_name} logo`} /> : <span className="public-business-logo business-logo-fallback"><Store size={32} /></span>}
      <div className="public-business-heading">
        <p className="eyebrow">Jimvolt seller storefront</p>
        <h1>{seller.business_name} <VerifiedBusinessBadge verified={Boolean(seller.is_verified)} /></h1>
        <p className="muted">{seller.is_verified ? 'Verified seller' : 'Marketplace seller'}{seller.category_name ? ` · ${seller.category_name}` : ''}</p>
        {(seller.city || seller.state) && <p className="business-location"><MapPin size={16} /> {[seller.city, seller.state].filter(Boolean).join(', ')}</p>}
      </div>
      <div className="public-business-actions">
        {seller.phone && <a className="btn btn-primary" href={`tel:${seller.phone}`}><Phone size={16} /> Contact business</a>}
        {seller.website_url && <a className="btn btn-white" href={seller.website_url} target="_blank" rel="noreferrer"><Globe2 size={16} /> Website</a>}
      </div>
    </header>
    <div className="public-business-content">
      <section className="panel public-business-about">
        <h2>About the business</h2>
        <p>{seller.description || 'This seller has not added a business description yet.'}</p>
        <dl>
          {seller.address && <div><dt>Address</dt><dd>{seller.address}{seller.city ? `, ${seller.city}` : ''}{seller.state ? `, ${seller.state}` : ''}</dd></div>}
          {seller.years_in_business !== null && <div><dt>Experience</dt><dd>{seller.years_in_business} years in business</dd></div>}
          {seller.operating_hours && <div><dt>Operating hours</dt><dd>{seller.operating_hours}</dd></div>}
          {seller.email && <div><dt>Email</dt><dd><a href={`mailto:${seller.email}`}>{seller.email}</a></dd></div>}
          {seller.whatsapp && <div><dt>WhatsApp</dt><dd><a href={`https://wa.me/${seller.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{seller.whatsapp}</a></dd></div>}
        </dl>
      </section>
      <section className="public-business-listings">
        <div className="section-head"><div><h2>Approved advertisements</h2><p className="muted">{advertisements.length} active listings</p></div></div>
        {advertisements.length ? <div className="grid">{advertisements.map((ad) => <ProductCard key={ad.id} ad={ad} />)}</div> : <EmptyState title="No active advertisements" text="This business does not have approved listings right now." />}
      </section>
    </div>
  </div>;
}
