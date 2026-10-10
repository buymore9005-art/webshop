begin;

create table if not exists public.brand_gallery (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 100),
  caption text not null default '' check (length(caption) <= 180),
  image_url text not null check (
    length(image_url) <= 2048 and
    image_url ~ '^https://[^[:space:]]+$'
  ),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brand_gallery enable row level security;
drop policy if exists zyha_brand_gallery_public_read on public.brand_gallery;
create policy zyha_brand_gallery_public_read on public.brand_gallery
  for select to anon, authenticated using (is_active);
drop policy if exists zyha_brand_gallery_admin_all on public.brand_gallery;
create policy zyha_brand_gallery_admin_all on public.brand_gallery
  for all to authenticated
  using ((select public.zyha_is_admin()))
  with check ((select public.zyha_is_admin()));
revoke all on public.brand_gallery from public, anon, authenticated;
grant select on public.brand_gallery to anon, authenticated;
grant insert, update, delete on public.brand_gallery to authenticated;
grant all on public.brand_gallery to service_role;

drop trigger if exists zyha_touch_brand_gallery on public.brand_gallery;
create trigger zyha_touch_brand_gallery before update on public.brand_gallery
  for each row execute function public.zyha_touch();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'brand_gallery'
     ) then
    alter publication supabase_realtime add table public.brand_gallery;
  end if;
end $$;

commit;
