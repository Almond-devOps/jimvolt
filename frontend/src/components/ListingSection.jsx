import { Link } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import EmptyState from './EmptyState.jsx';
import useAsync from '../hooks/useAsync.js';

function SkeletonGrid({ n }) {
  return <div className="grid">{Array.from({ length: n }).map((_, i) => <div key={i} className="card skeleton" aria-hidden="true" />)}</div>;
}

/** A titled section that loads its own ads, with loading, error and empty states. */
export default function ListingSection({ title, subtitle, loader, to, skeletons = 4 }) {
  const { data, loading, error, retry } = useAsync(loader);
  return (
    <section className="section container">
      <div className="section-head">
        <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
        {to && <Link to={to} className="link">View all</Link>}
      </div>
      {loading && <SkeletonGrid n={skeletons} />}
      {error && <div role="alert" className="alert">{error} <button type="button" className="link" onClick={retry}>Try again</button></div>}
      {data && data.length === 0 && <EmptyState title="No adverts yet" text="Be the first to post in this section." action={<Link className="btn btn-primary" to="/post-ad">Post your ad</Link>} />}
      {data && data.length > 0 && <div className="grid">{data.map((ad) => <ProductCard key={ad.id} ad={ad} />)}</div>}
    </section>
  );
}
