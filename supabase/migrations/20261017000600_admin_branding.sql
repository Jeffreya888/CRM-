-- Platform admin work lists and a public bucket for company logos.

-- Companies waiting on a texting number and open scheduling-integration
-- requests, for the Flight Ready platform admin screen.
create or replace function public.platform_pending()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return jsonb_build_object(
    'texting', (select coalesce(jsonb_agg(x order by x.name), '[]') from (
        select id, name, email, phone, sms_status, sms_number from organizations where sms_status = 'pending' and not is_demo) x),
    'integrations', (select coalesce(jsonb_agg(x order by x.created_at), '[]') from (
        select r.id, r.provider, r.management_company, r.contact_name, r.contact_email, r.status, r.created_at, o.name as company
        from integration_requests r join organizations o on o.id = r.org_id
        where r.status in ('prepared','sent_to_vendor','approved')) x)
  );
end;
$$;

-- Logos appear on invoices, emails and the customer portal, so they live in
-- a public bucket (paths "<org_id>/logo-*.png"); only admins of that company
-- can write there.
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
  on conflict (id) do nothing;
create policy branding_write on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin(((storage.foldername(name))[1])::uuid));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin(((storage.foldername(name))[1])::uuid));
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin(((storage.foldername(name))[1])::uuid));
