import { useState } from 'react';
import { resolveImageUrl } from '../utils/imageUrl.js';

export default function UserAvatar({ src, name, className = '', alt = '' }) {
  const imageUrl = src ? resolveImageUrl(src) : '';
  const [failedUrl, setFailedUrl] = useState('');

  if (imageUrl && failedUrl !== imageUrl) {
    return <img className={className} src={imageUrl} alt={alt} onError={() => setFailedUrl(imageUrl)} />;
  }

  const initial = name?.trim()?.[0]?.toUpperCase() || 'J';
  return alt
    ? <span className={className} role="img" aria-label={alt}>{initial}</span>
    : <span className={className} aria-hidden="true">{initial}</span>;
}
