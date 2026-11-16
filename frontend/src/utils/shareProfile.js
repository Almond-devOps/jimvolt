/**
 * Public site origin used for share links. Set VITE_PUBLIC_SITE_URL (for example
 * https://jimvolt.com) so links always point at the public domain.
 */
export function getPublicSiteOrigin(fallbackOrigin) {
  const configured = import.meta.env?.VITE_PUBLIC_SITE_URL;
  return String(configured || fallbackOrigin || '').replace(/\/$/, '');
}

/**
 * Builds the public profile URL, e.g. https://jimvolt.com/@ada-lovelace.
 * Throws when the username is missing, because a profile without a username
 * has no shareable address.
 */
export function getPublicProfileUrl(username, origin) {
  const handle = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(handle)) {
    throw new TypeError('A username is required to build the public profile URL.');
  }
  const baseUrl = getPublicSiteOrigin(origin);
  if (!baseUrl) {
    throw new TypeError('A site origin is required to build the public profile URL.');
  }
  return `${baseUrl}/@${encodeURIComponent(handle)}`;
}

export function getSocialShareUrls(profileUrl, displayName) {
  const shareText = `Connect with ${displayName} on Jimvolt`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText}: ${profileUrl}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}&quote=${encodeURIComponent(shareText)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(shareText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(shareText)}`,
  };
}

export async function copyTextToClipboard(
  text,
  clipboard = globalThis.navigator?.clipboard,
  documentRef = globalThis.document,
) {
  let clipboardError;
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  if (documentRef?.body && typeof documentRef.execCommand === 'function') {
    const textArea = documentRef.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';

    try {
      documentRef.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      if (documentRef.execCommand('copy')) return;
    } finally {
      textArea.remove();
    }
  }

  throw new Error(
    'Unable to copy the profile link.',
    clipboardError ? { cause: clipboardError } : undefined,
  );
}
