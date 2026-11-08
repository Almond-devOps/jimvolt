import { useState } from 'react';

export default function ImageWithFallback({ src, fallbackSrc, alt, ...props }) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  const handleError = () => {
    if (!fallbackAttempted && fallbackSrc && resolvedSrc !== fallbackSrc) {
      setResolvedSrc(fallbackSrc);
      setFallbackAttempted(true);
      return;
    }
    setResolvedSrc('');
  };

  if (!resolvedSrc) {
    return <span className={`${props.className || ''} image-unavailable`} role="img" aria-label={alt} />;
  }

  return <img {...props} src={resolvedSrc} alt={alt} onError={handleError} />;
}