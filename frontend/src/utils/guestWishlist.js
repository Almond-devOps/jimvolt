export const GUEST_WISHLIST_KEY = 'jimvolt_guest_wishlist';

export function readGuestWishlist(storage = localStorage) {
  try {
    const items = JSON.parse(storage.getItem(GUEST_WISHLIST_KEY) || '[]');
    return Array.isArray(items) ? items.filter((item) => item && /^\d+$/.test(String(item.advertisement_id))) : [];
  } catch { return []; }
}

export function saveGuestProduct(ad, storage = localStorage) {
  if (!ad?.id) throw new Error('This product could not be saved.');
  const id = String(ad.id);
  const snapshot = {
    favorite_id: id, advertisement_id: id, title: ad.title, price: ad.price,
    city: ad.city, state: ad.state, category_id: ad.category?.id || ad.category_id,
    category_slug: ad.category?.slug || ad.category_slug,
    condition_type: ad.condition_type || ad.condition,
    seller_name: ad.seller?.name || ad.seller_name || (typeof ad.seller === 'string' ? ad.seller : ''),
    image: ad.images?.[0] || ad.image, available: true, favorited_at: new Date().toISOString(),
  };
  const items = [snapshot, ...readGuestWishlist(storage).filter((item) => String(item.advertisement_id) !== id)];
  storage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(items));
  return items;
}

export function removeGuestProduct(id, storage = localStorage) {
  const items = readGuestWishlist(storage).filter((item) => String(item.advertisement_id) !== String(id));
  storage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(items));
  return items;
}

export function queryGuestWishlist(params = {}, storage = localStorage) {
  const all = readGuestWishlist(storage);
  const query = String(params.q || '').toLowerCase();
  const items = all.filter((item) => (!query || `${item.title} ${item.seller_name}`.toLowerCase().includes(query))
    && (!params.category || [String(item.category_id), item.category_slug].includes(String(params.category))));
  if (params.sort === 'price_asc') items.sort((a, b) => Number(a.price) - Number(b.price));
  if (params.sort === 'price_desc') items.sort((a, b) => Number(b.price) - Number(a.price));
  const limit = Math.max(1, Number(params.limit) || 12);
  const page = Math.max(1, Number(params.page) || 1);
  return { favorites: items.slice((page - 1) * limit, page * limit), favoriteIds: all.map((item) => String(item.advertisement_id)),
    total: all.length, pagination: { page, total: items.length, pages: Math.ceil(items.length / limit) } };
}
