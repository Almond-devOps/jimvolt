import { useEffect, useRef, useState } from 'react';
import { Camera, Mail, Phone, UserCircle2, CalendarDays, ShieldCheck, PencilLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getUserProfile, updateUserProfile } from '../services/userService.js';
import { useAuth } from '../context/AuthContext.jsx';
import VerifiedBusinessBadge from '../components/VerifiedBusinessBadge.jsx';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', profileImage: '' });
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const { refreshUser } = useAuth();
  const mountedRef = useRef(false);

  const loadProfile = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data } = await getUserProfile();
      if (!mountedRef.current) return;
      setProfile(data.user);
      setForm({
        fullName: data.user.full_name,
        phone: data.user.phone || '',
        profileImage: data.user.profile_image || '',
      });
    } catch (error) {
      if (mountedRef.current) {
        setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to load your profile.' });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadProfile();
    return () => { mountedRef.current = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await updateUserProfile(form);
      setProfile(data.user);
      await refreshUser();
      setEditing(false);
      setNotice({ type: 'success', text: 'Your profile has been updated.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update your profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="auth-shell"><div className="auth-card loading-card">Loading profile...</div></div>;
  }

  if (!profile) {
    return (
      <div className="auth-shell">
        <div className="auth-card loading-card">
          <p className="notice error" role="alert">{notice?.text || 'Unable to load your profile.'}</p>
          <button type="button" className="btn btn-primary" onClick={loadProfile}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <div className="profile-card">
        {notice && <div className={`notice ${notice.type}`} role="status">{notice.text}</div>}
        <div className="profile-header">
          <div className="profile-avatar-wrap">
            {profile.profile_image ? (
              <img src={profile.profile_image} alt={profile.full_name} className="profile-avatar" />
            ) : (
              <div className="profile-avatar avatar-fallback">{profile.full_name?.charAt(0) || 'J'}</div>
            )}
            <button type="button" className="profile-upload" aria-label="Edit profile picture" onClick={() => setEditing(true)}><Camera size={16} /></button>
          </div>
          <div>
            <p className="eyebrow">My profile</p>
            <h1>{profile.full_name} <VerifiedBusinessBadge verified={Boolean(profile.is_verified)} /></h1>
            <p className="muted">{profile.is_verified ? 'Verified seller' : 'Awaiting verification'}</p>
          </div>
        </div>

        <div className="profile-meta-grid">
          <InfoItem icon={Mail} label="Email" value={profile.email} />
          <InfoItem icon={Phone} label="Phone" value={profile.phone || 'Not provided'} />
          <InfoItem icon={CalendarDays} label="Joined" value={new Date(profile.created_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })} />
          <InfoItem icon={ShieldCheck} label="Verification" value={profile.is_verified ? 'Verified' : 'Pending'} />
        </div>

        <div className="profile-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing((current) => !current)}><PencilLine size={16} /> {editing ? 'Cancel edit' : 'Edit profile'}</button>
          <Link to="/account-settings" className="btn btn-white">Account settings</Link>
        </div>

        {editing && (
          <form onSubmit={submit} className="profile-form panel">
            <label className="field">
              <span>Full name</span>
              <input required minLength="2" maxLength="120" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
            </label>
            <label className="field">
              <span>Phone number</span>
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label className="field">
              <span>Profile image URL</span>
              <input value={form.profileImage} onChange={(event) => setForm((current) => ({ ...current, profileImage: event.target.value }))} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="info-item">
      <div className="stat-icon"><Icon size={18} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
