export function getPublicProfileUrl(profileId, origin) {
  if ((typeof profileId !== 'string' && typeof profileId !== 'number') || !String(profileId).trim()) {
    throw new TypeError('A profile ID is required to build the public profile URL.');
  }
  if (typeof origin !== 'string' || !origin.trim()) {
    throw new TypeError('A site origin is required to build the public profile URL.');
  }

  const baseUrl = origin.replace(/\/$/, '');
  return `${baseUrl}/sellers/${encodeURIComponent(String(profileId))}`;
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
