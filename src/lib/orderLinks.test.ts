import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCarts } from './orderLinks';

test('Shopify carts are pre-filled from variant links', () => {
  const [c] = buildCarts([
    { name: 'Wash', url: 'https://shop.detailco.com/products/wash?variant=111', qty: 2 },
    { name: 'Towels', url: 'shop.detailco.com/products/towels?variant=222', qty: 1.5 },
  ]);
  assert.equal(c!.store, 'shop.detailco.com');
  assert.equal(c!.cartUrl, 'https://shop.detailco.com/cart/111:2,222:2');
  assert.equal(c!.items.length, 2);
});

test('Amazon carts use the ASIN', () => {
  const [c] = buildCarts([{ name: 'Gloves', url: 'https://www.amazon.com/Nitrile-Gloves/dp/B07ABCDEF1/ref=sr_1', qty: 3 }]);
  assert.equal(c!.store, 'amazon.com');
  assert.equal(c!.cartUrl, 'https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07ABCDEF1&Quantity.1=3');
});

test('other stores and missing variants fall back to product links', () => {
  const carts = buildCarts([
    { name: 'Polish', url: 'https://supply.example/item/42', qty: 1 },
    { name: 'Pads', url: 'https://shop.detailco.com/products/pads', qty: 1 },
    { name: 'Bad', url: 'not a url at all', qty: 1 },
  ]);
  assert.equal(carts.length, 2);
  assert.ok(carts.every((c) => c.cartUrl === null));
});
