import { useEffect, useRef, useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { changePassword, getUserProfile, updateUserSettings } from '../services/userService.js';
import LogoutAction from '../components/LogoutAction.jsx';

export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [settingsForm, setSettingsForm] = useState({ email: '', phone: '', currentPassword: '' });
  const mountedRef = useRef(false);

  const loadProfile = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await getUserProfile();
      if (!mountedRef.current) return;
      setProfile(data.user);
      setSettingsForm({
        email: data.user.email || '',
        phone: data.user.phone || '',
      });
    } catch (error) {
      if (mountedRef.current) {
        setLoadError(error.response?.data?.message || 'Unable to load your account settings.');
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

  useEffect(() => {
    if (!loading && location.hash === '#change-password') {
      document.getElementById('change-password')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, location.hash]);

  const saveSettings = async (event) => {
    event.preventDefault();
    try {
      const { data } = await updateUserSettings(settingsForm);
      setProfile(data.user);
      await refreshUser();
      setSettingsForm((current) => ({ ...current, currentPassword: '' }));
      setMessage({ type: 'success', text: data.message || 'Profile details updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Unable to save profile changes.' });
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    try {
      const { data } = await changePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setMessage({ type: 'success', text: data.message || 'Password updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Unable to change your password.' });
    }
  };

  if (loading) {
    return <div className="auth-shell"><div className="auth-card loading-card">Loading settings...</div></div>;
  }

  if (loadError || !profile) {
    return (
      <div className="auth-shell">
        <div className="auth-card loading-card">
          <p className="notice error" role="alert">{loadError || 'Unable to load your account settings.'}</p>
          <button type="button" className="btn btn-primary" onClick={loadProfile}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <div className="settings-page">
        <div className="panel settings-panel">
          <h2>Account settings</h2>
          {message && <div className={`notice ${message.type}`}>{message.text}</div>}

          <form onSubmit={saveSettings} className="settings-form">
            <label className="field">
              <span>Email address</span>
              <input type="email" value={settingsForm.email} onChange={(event) => setSettingsForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            {settingsForm.email.trim().toLowerCase() !== profile.email && <label className="field">
              <span>Current password (required to change email)</span>
              <input type="password" autoComplete="current-password" value={settingsForm.currentPassword} onChange={(event) => setSettingsForm((current) => ({ ...current, currentPassword: event.target.value }))} required />
            </label>}

            <label className="field">
              <span>Phone number</span>
              <input value={settingsForm.phone} onChange={(event) => setSettingsForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>

            <button type="submit" className="btn btn-primary">Save profile</button>
          </form>
        </div>

        <div className="panel settings-panel" id="change-password">
          <h2>Change password</h2>
          <form onSubmit={savePassword} className="settings-form">
            <label className="field">
              <span>Current password</span>
              <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
            </label>
            <button type="submit" className="btn btn-primary">Update password</button>
          </form>
        </div>

        <div className="panel settings-panel action-panel">
          <h2>Account actions</h2>
          <button type="button" className="btn btn-white" onClick={() => navigate('/profile')}><Mail size={18} /> View profile</button>
          <LogoutAction className="btn btn-logout" label="Log out" />
        </div>
      </div>
    </div>
  );
}
