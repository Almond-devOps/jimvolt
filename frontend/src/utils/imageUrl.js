const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function resolveImageUrl(image) {
  if (typeof image !== 'string' || !image.startsWith('/uploads/')) return image;
  const apiOrigin = new URL(apiBaseUrl, 'http://localhost:5173').origin;
  return new URL(image, `${apiOrigin}/`).toString();
}
