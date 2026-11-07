const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

export function resolveImageUrl(image) {
  if (typeof image !== 'string' || !image.startsWith('/uploads/')) return image;
  const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin;
  return new URL(image, `${apiOrigin}/`).toString();
}
