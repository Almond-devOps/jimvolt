import { useEffect, useRef, useState } from 'react';
import { Camera, Mail, Phone, CalendarDays, ShieldCheck, PencilLine, KeyRound, Settings, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getUserProfile, removeUserProfileImage, updateUserProfile } from '../services/userService.js';
import { useAuth } from '../context/AuthContext.jsx';
import LogoutAction from '../components/LogoutAction.jsx';
import VerifiedBusinessBadge from '../components/VerifiedBusinessBadge.jsx';
import ProfilePictureUpload from '../components/ProfilePictureUpload.jsx';
import ShareProfileDialog from '../components/ShareProfileDialog.jsx';
import UserAvatar from '../components/UserAvatar.jsx';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '' });
  const [selectedImage, setSelectedImage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sharingProfile, setSharingProfile] = useState(false);
  const { refreshUser } = useAuth();
  const mountedRef = useRef(false);
  const shareButtonRef = useRef(null);

  const closeShareDialog = () => {
    setSharingProfile(false);
    window.requestAnimationFrame(() => shareButtonRef.current?.focus());
  };

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
    setUploadProgress(0);
    setNotice(null);
    try {
      const payload = new FormData();
      payload.append('fullName', form.fullName);
      payload.append('phone', form.phone);
      if (selectedImage) payload.append('profileImage', selectedImage);
      const { data } = await updateUserProfile(payload, (event) => {
        if (event.total) setUploadProgress(Math.round((event.loaded * 100) / event.total));
      });
      setProfile(data.user);
      await refreshUser(data.user);
      setSelectedImage(null);
      setEditing(false);
      setNotice({ type: 'success', text: 'Your profile has been updated.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update your profile.' });
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async () => {
    if (!window.confirm('Remove your profile photo?')) return;
    setRemovingImage(true);
    setNotice(null);
    try {
      const { data } = await removeUserProfileImage();
      setProfile(data.user);
      setSelectedImage(null);
      await refreshUser(data.user);
      setNotice({ type: 'success', text: 'Your profile photo has been removed.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to remove your profile photo.' });
    } finally {
      setRemovingImage(false);
    }
  };

  const toggleEditing = () => {
    if (editing) {
      setSelectedImage(null);
      setNotice(null);
    }
    setEditing((current) => !current);
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
            <UserAvatar src={profile.profile_image} name={profile.full_name} alt={profile.full_name} className="profile-avatar avatar-fallback" />
            <button type="button" className="profile-upload" aria-label="Edit profile picture" onClick={() => setEditing(true)}><Camera size={16} /></button>
          </div>
          <div>
            <p className="eyebrow">My profile</p>
            <h1>{profile.full_name} <VerifiedBusinessBadge verified={Boolean(profile.is_verified)} /></h1>
            <p className="muted">{profile.is_verified ? 'Verified seller' : 'Awaiting verification'}</p>
          </div>
          <button
            ref={shareButtonRef}
            type="button"
            className="btn btn-primary profile-share-button"
            aria-haspopup="dialog"
            aria-expanded={sharingProfile}
            onClick={() => setSharingProfile(true)}
          >
            <Share2 size={18} aria-hidden="true" />
            Share Profile
          </button>
        </div>

        <div className="profile-meta-grid">
          <InfoItem icon={Mail} label="Email" value={profile.email} />
          <InfoItem icon={Phone} label="Phone" value={profile.phone || 'Not provided'} />
          <InfoItem icon={CalendarDays} label="Joined" value={new Date(profile.created_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })} />
          <InfoItem icon={ShieldCheck} label="Verification" value={profile.is_verified ? 'Verified' : 'Pending'} />
        </div>

        <section className="profile-account-actions" aria-labelledby="profile-actions-title">
          <div className="profile-account-actions-heading">
            <h2 id="profile-actions-title">Account actions</h2>
            <p className="muted">Manage your profile and account access.</p>
          </div>
          <div className="profile-action-grid">
            <button
              type="button"
              className="profile-action"
              aria-expanded={editing}
              aria-controls="profile-edit-form"
              onClick={toggleEditing}
            >
              <PencilLine size={19} aria-hidden="true" />
              <span className="profile-action-copy"><strong>{editing ? 'Cancel edit' : 'Edit profile'}</strong><small>Update your profile details</small></span>
            </button>
            <Link to="/account-settings#change-password" className="profile-action">
              <KeyRound size={19} aria-hidden="true" />
              <span className="profile-action-copy"><strong>Change password</strong><small>Update your sign-in password</small></span>
            </Link>
            <Link to="/account-settings" className="profile-action">
              <Settings size={19} aria-hidden="true" />
              <span className="profile-action-copy"><strong>Account settings</strong><small>Manage contact details</small></span>
            </Link>
            <LogoutAction className="profile-action logout-action" label="Logout" />
          </div>
        </section>

        {editing && (
          <form id="profile-edit-form" onSubmit={submit} className="profile-form panel">
            <label className="field">
              <span>Full name</span>
              <input required minLength="2" maxLength="120" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
            </label>
            <label className="field">
              <span>Phone number</span>
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <ProfilePictureUpload
              currentImage={profile.profile_image}
              name={profile.full_name}
              file={selectedImage}
              onFileChange={setSelectedImage}
              onRemove={removeImage}
              disabled={saving || removingImage}
              uploading={saving && Boolean(selectedImage)}
              uploadProgress={uploadProgress}
            />
            <button type="submit" className="btn btn-primary" disabled={saving || removingImage}>{saving ? 'Saving...' : 'Save changes'}</button>
          </form>
        )}
      </div>
      {sharingProfile && <ShareProfileDialog profile={profile} onClose={closeShareDialog} />}
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
