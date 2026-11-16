import { useState } from 'react';
import { CalendarDays, Share2 } from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import ProductCard from './ProductCard.jsx';
import ShareProfileDialog from './ShareProfileDialog.jsx';
import UserAvatar from './UserAvatar.jsx';
import VerifiedBusinessBadge from './VerifiedBusinessBadge.jsx';

// Public page for a member without a business profile, shown at /@username.
export default function PublicUserProfile({ user, advertisements = [] }) {
  const [sharing, setSharing] = useState(false);
  const memberSince = user.member_since
    ? new Date(user.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="container section public-business-page">
      <header className="panel public-business-header">
        <UserAvatar src={user.profile_image} name={user.full_name} alt={user.full_name} className="public-business-logo" />

        <div className="public-business-heading">
          <p className="eyebrow">Jimvolt member</p>
          <h1>
            {user.full_name}
            {' '}
            <VerifiedBusinessBadge verified={Boolean(user.is_verified)} />
          </h1>
          <p className="muted">@{user.username}</p>
          {memberSince && (
            <p className="muted"><CalendarDays size={16} aria-hidden="true" /> Member since {memberSince}</p>
          )}
        </div>

        <div className="public-business-actions">
          <button type="button" className="btn btn-white" onClick={() => setSharing(true)} aria-label="Share this profile">
            <Share2 size={16} /> Share
          </button>
        </div>
      </header>

      <section className="section-block">
        <h2>Listings</h2>
        {advertisements.length > 0 ? (
          <div className="product-grid">
            {advertisements.map((ad) => <ProductCard key={ad.id} ad={ad} />)}
          </div>
        ) : (
          <EmptyState title="No listings yet" description="This member has no approved listings at the moment." />
        )}
      </section>

      {sharing && (
        <ShareProfileDialog
          profile={{ id: user.id, full_name: user.full_name, username: user.username, profile_image: user.profile_image }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
