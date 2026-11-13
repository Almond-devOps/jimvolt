import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Star } from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function SellerRating({ sellerId }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const [rating, setRating] = useState(null);
  const [score, setScore] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setRating(null);
    setError('');
    setNotice('');
    if (sellerId) api.get(`/ads/sellers/${sellerId}/ratings`).then(({ data }) => {
      if (active) { setRating(data); setScore(String(data.mine || 5)); }
    }).catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load seller ratings.'));
    return () => { active = false; };
  }, [sellerId, isAuthenticated]);
  if (!sellerId) return null;
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/ads/sellers/${sellerId}/ratings`, { score: Number(score) });
      setRating(data);
      setNotice('Your rating has been saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save your rating.');
    } finally { setSaving(false); }
  };
  return <section className="seller-rating" aria-label="Seller ratings">
    {rating && <p className="seller-rating-summary"><Star size={17} aria-hidden="true" /> {rating.count ? `${Number(rating.average).toFixed(1)} / 5 · ${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet'}</p>}
    {rating && isAuthenticated && String(user.id) !== String(sellerId) && <form onSubmit={submit} className="seller-rating-form">
      <label className="field"><span>{rating.mine ? 'Update your rating' : 'Rate this seller'}</span><select value={score} onChange={(event) => setScore(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}</select></label>
      <button type="submit" className="btn btn-white" disabled={saving}>{saving ? 'Saving...' : 'Save rating'}</button>
    </form>}
    {!isAuthenticated && <Link className="link" to="/login" state={{ from: location.pathname }}>Sign in to rate this seller</Link>}
    {notice && <p role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
