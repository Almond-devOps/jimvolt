import { useEffect, useRef, useState } from 'react';
import { AtSign, Copy, MessageCircle, Send, Share2, Users, X } from 'lucide-react';
import UserAvatar from './UserAvatar.jsx';
import { copyTextToClipboard, getPublicProfileUrl, getSocialShareUrls } from '../utils/shareProfile.js';

const CLOSE_ANIMATION_MS = 180;
const COPY_FEEDBACK_MS = 2200;
const FEEDBACK_MS = 3200;

const socialOptions = [
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { key: 'facebook', label: 'Facebook', Icon: Users },
  { key: 'x', label: 'X', Icon: AtSign },
  { key: 'telegram', label: 'Telegram', Icon: Send },
];

function copyTextWithLegacyFallback(text, clipboard = globalThis.navigator?.clipboard, documentRef = globalThis.document) {
  return copyTextToClipboard(text, clipboard, documentRef);
}

export default function ShareProfileDialog({ profile, onClose }) {
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const copiedTimerRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Prefer the seller's public slug for the shareable URL; fall back to numeric ID
  const profileUrl = getPublicProfileUrl(profile.username || profile.public_slug || profile.id, window.location.origin);
  const socialUrls = getSocialShareUrls(profileUrl, profile.full_name);
  const canShareNatively = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    const dialog = dialogRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    dialog.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      window.clearTimeout(closeTimerRef.current);
      window.clearTimeout(copiedTimerRef.current);
      window.clearTimeout(feedbackTimerRef.current);
      if (dialog.open) dialog.close();
    };
  }, []);

  const showFeedback = (type, text) => {
    window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ type, text });
    if (type === 'success') {
      feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    }
  };

  const requestClose = () => {
    if (closeTimerRef.current !== null) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
      onClose();
    }, CLOSE_ANIMATION_MS);
  };

  const handleCancel = (event) => {
    event.preventDefault();
    requestClose();
  };

  const handleCopy = async () => {
    setIsCopying(true);
    setIsCopied(false);
    setFeedback(null);
    window.clearTimeout(copiedTimerRef.current);
    try {
      await copyTextWithLegacyFallback(profileUrl);
      setIsCopied(true);
      showFeedback('success', 'Profile link copied to clipboard.');
      copiedTimerRef.current = window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      showFeedback('error', 'Could not copy automatically. Select the profile URL and copy it manually.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `${profile.full_name} on Jimvolt`,
        text: `Connect with ${profile.full_name} on Jimvolt`,
        url: profileUrl,
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        showFeedback('error', 'Unable to open the sharing menu. Choose a service below instead.');
      }
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={`share-profile-dialog${isClosing ? ' is-closing' : ''}`}
      aria-labelledby="share-profile-title"
      aria-describedby="share-profile-description"
      tabIndex="-1"
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="share-dialog-content">
        <header className="share-dialog-header">
          <div>
            <p className="eyebrow">Share profile</p>
            <h2 id="share-profile-title">Connect on Jimvolt</h2>
          </div>
          <button type="button" className="share-dialog-close" onClick={requestClose} aria-label="Close share profile dialog">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="share-profile-identity">
          <UserAvatar
            src={profile.profile_image}
            name={profile.full_name}
            alt={profile.full_name}
            className="share-profile-avatar"
          />
          <div className="share-profile-identity-copy">
            <h3>{profile.full_name}</h3>
            <p>{profile.username ? `@${profile.username}` : `Member #${profile.id}`}</p>
          </div>
        </div>

        <p id="share-profile-description" className="share-dialog-description">
          Share this profile with friends and let them connect with you.
        </p>

        <div className="share-profile-url">
          <label htmlFor="share-profile-url-input">Public profile URL</label>
          <input
            id="share-profile-url-input"
            type="text"
            value={profileUrl}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>

        <div className="share-dialog-actions">
          <button type="button" className="btn btn-primary share-copy-button" onClick={handleCopy} disabled={isCopying}>
            <Copy size={17} aria-hidden="true" />
            {isCopied ? 'Copied!' : 'Copy Link'}
          </button>
          {canShareNatively && (
            <button type="button" className="btn btn-white share-native-button" onClick={handleNativeShare}>
              <Share2 size={17} aria-hidden="true" />
              Share
            </button>
          )}
        </div>

        <div className="share-social-section">
          <h3>Share with</h3>
          <div className="share-social-grid">
            {socialOptions.map(({ key, label, Icon }) => (
              <a
                key={key}
                className={`share-social-link share-social-${key}`}
                href={socialUrls[key]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Share ${profile.full_name}'s profile on ${label}`}
              >
                <span className="share-social-icon"><Icon size={18} aria-hidden="true" /></span>
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>

        {feedback && (
          <p
            className={`share-feedback share-feedback-${feedback.type}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
            aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </dialog>
  );
}
