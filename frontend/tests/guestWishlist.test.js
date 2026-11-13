import assert from 'node:assert/strict';
import test from 'node:test';
import { GUEST_WISHLIST_KEY, readGuestWishlist, saveGuestProduct, removeGuestProduct, queryGuestWishlist } from '../src/utils/guestWishlist.js';

const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
test('guest saves persist without duplicates and support filters, paging and removal', () => {
  const store = storage();
  saveGuestProduct({ id: 1, title: 'Solar panel', price: 20, category: { id: 2 }, seller: { name: 'Alice' } }, store);
  saveGuestProduct({ id: 2, title: 'Inverter', price: 10, category: { id: 3 }, seller_name: 'Bob' }, store);
  saveGuestProduct({ id: 1, title: 'Updated solar panel', price: 30, category: { id: 2 }, seller: { name: 'Alice' } }, store);
  assert.equal(readGuestWishlist(store).length, 2);
  assert.deepEqual(queryGuestWishlist({ sort: 'price_asc', limit: 1 }, store).favorites.map((item) => item.advertisement_id), ['2']);
  assert.equal(queryGuestWishlist({ q: 'alice', category: 2 }, store).pagination.total, 1);
  removeGuestProduct(1, store);
  assert.deepEqual(readGuestWishlist(store).map((item) => item.advertisement_id), ['2']);
});
test('corrupt storage is recoverable and write failures are reported instead of pretending to save', () => {
  const store = storage();
  store.setItem(GUEST_WISHLIST_KEY, '{broken');
  assert.deepEqual(readGuestWishlist(store), []);
  assert.throws(() => saveGuestProduct({ id: 1 }, { ...store, setItem() { throw new Error('storage full'); } }), /storage full/);
});
