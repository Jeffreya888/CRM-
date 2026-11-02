-- Supplies bought from web stores: instead of emailing a vendor, automatic
-- reordering tells the owner "ready to reorder" with a link that opens the
-- store's cart already filled (Shopify and Amazon) or the product links.
alter table public.inventory_items add column order_online boolean not null default false;
comment on column public.inventory_items.order_online is 'Ordered from a web store (vendor_url is the product link) rather than by emailing the vendor.';
