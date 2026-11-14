import { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Copy, ExternalLink, KeyRound, Mail } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { changePassword, getUserProfile, updateUserSettings } from '../services/userService.js';
import { checkUsername, updateUsername } from '../services/sellerService.js';
import LogoutAction from '../components/LogoutAction.jsx';

const USERNAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/i;
const DEBOUNCE_MS = 500;

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

  // Username management
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'unavailable' | 'invalid' | 'same'
  const [usernameMessage, setUsernameMessage] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef(null);
  const mountedRef = useRef(false);

  const profileUrl = profile?.username
    ? `${window.location.origin}/@${profile.username}`
    : null;

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
      setUsernameInput(data.user.username || '');
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

  // Debounced availability check
  const handleUsernameChange = useCallback((value) => {
    setUsernameInput(value);
    setUsernameStatus(null);
    setUsernameMessage('');
    clearTimeout(debounceRef.current);

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return;

    if (trimmed.length < 3) {
      setUsernameStatus('invalid');
      setUsernameMessage('Must be at least 3 characters.');
      return;
    }
    if (trimmed.length > 48) {
      setUsernameStatus('invalid');
      setUsernameMessage('Must be 48 characters or fewer.');
      return;
    }
    if (!USERNAME_RE.test(trimmed)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Letters, numbers and hyphens only. Cannot start or end with a hyphen.');
      return;
    }
    if (trimmed === profile?.username) {
      setUsernameStatus('same');
      setUsernameMessage('This is your current username.');
      return;
    }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await checkUsername(trimmed);
        if (!mountedRef.current) return;
        if (data.available) {
          setUsernameStatus('available');
          setUsernameMessage('This username is available.');
        } else {
          setUsernameStatus('unavailable');
          setUsernameMessage(data.reason || 'This username is not available.');
        }
      } catch {
        if (mountedRef.current) {
          setUsernameStatus(null);
          setUsernameMessage('');
        }
      }
    }, DEBOUNCE_MS);
  }, [profile?.username]);

  const saveUsername = async (event) => {
    event.preventDefault();
    if (savingUsername) return;
    const trimmed = usernameInput.trim().toLowerCase();
    if (!trimmed || usernameStatus === 'unavailable' || usernameStatus === 'invalid') return;
    setSavingUsername(true);
    setMessage(null);
    try {
      const { data } = await updateUsername(trimmed);
      const refreshed = await refreshUser();
      if (mountedRef.current) {
        setProfile(refreshed);
        setUsernameInput(trimmed);
        setUsernameStatus('same');
        setUsernameMessage('This is your current username.');
        setMessage({ type: 'success', text: data.message || 'Username updated.' });
      }
    } catch (error) {
      if (mountedRef.current) {
        setMessage({ type: 'error', text: error.response?.data?.message || 'Unable to save username.' });
      }
    } finally {
      if (mountedRef.current) setSavingUsername(false);
    }
  };

  const copyProfileLink = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  };

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

  const usernameStatusClass = {
    available: 'success',
    unavailable: 'error',
    invalid: 'error',
    same: 'muted',
    checking: 'muted',
  }[usernameStatus] || '';

  return (
    <div className="container section">
      <div className="settings-page">
        {message && <div className={`notice ${message.type}`}>{message.text}</div>}

        {/* ── Public profile URL (username) ─────────────────────────── */}
        <div className="panel settings-panel" id="public-profile-url">
          <h2><AtSign size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />Public profile URL</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Your public profile URL is the link you share with customers. It looks like{' '}
            <strong>jimvolt.app/@yourname</strong>. You can change it once—your old link will redirect automatically.
          </p>

          {profileUrl && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="current-profile-url">Your current public URL</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  id="current-profile-url"
                  type="text"
                  value={profileUrl}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <button type="button" className="btn btn-white" onClick={copyProfileLink} style={{ whiteSpace: 'nowrap' }}>
                  <Copy size={15} /> {copied ? 'Copied!' : 'Copy'}
                </button>
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-white"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <ExternalLink size={15} /> View
                </a>
              </div>
            </div>
          )}

          <form onSubmit={saveUsername} className="settings-form">
            <div className="field">
              <label htmlFor="username-input">
                Choose your username
                {usernameStatus === 'checking' && <span className="muted" style={{ marginLeft: 8, fontSize: '0.85em' }}>Checking…</span>}
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="muted" style={{ lineHeight: 1 }}>@</span>
                <input
                  id="username-input"
                  type="text"
                  value={usernameInput}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="yourname"
                  minLength={3}
                  maxLength={48}
                  style={{ flex: 1, minWidth: 160 }}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              {usernameMessage && (
                <p className={usernameStatusClass || 'muted'} style={{ marginTop: 4, fontSize: '0.875em' }}>
                  {usernameStatus === 'available' && '✓ '}
                  {usernameStatus === 'unavailable' && '✕ '}
                  {usernameMessage}
                </p>
              )}
              <p className="muted" style={{ marginTop: 6, fontSize: '0.8em' }}>
                3–48 characters. Letters, numbers and hyphens only. Cannot start or end with a hyphen.
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                savingUsername ||
                !usernameInput.trim() ||
                usernameStatus === 'unavailable' ||
                usernameStatus === 'invalid' ||
                usernameStatus === 'checking' ||
                usernameStatus === 'same'
              }
            >
              {savingUsername ? 'Saving…' : 'Save username'}
            </button>
          </form>
        </div>

        {/* ── Account settings ──────────────────────────────────────── */}
        <div className="panel settings-panel">
          <h2>Account settings</h2>
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

        {/* ── Change password ───────────────────────────────────────── */}
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

        {/* ── Account actions ───────────────────────────────────────── */}
        <div className="panel settings-panel action-panel">
          <h2>Account actions</h2>
          <button type="button" className="btn btn-white" onClick={() => navigate('/profile')}><Mail size={18} /> View profile</button>
          <LogoutAction className="btn btn-logout" label="Log out" />
        </div>
      </div>
    </div>
  );
}
