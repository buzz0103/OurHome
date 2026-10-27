-- 우리집 정리: Supabase 초기 설정
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 한 번만 실행하세요.

-- 가족 4명 이름
create table if not exists public.members (
    id text primary key,
    name text not null
);
insert into public.members (id, name) values
    ('m1', '가족 1'), ('m2', '가족 2'), ('m3', '가족 3'), ('m4', '가족 4')
on conflict (id) do nothing;

-- 일정
create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    date date not null,
    time text,
    place text,
    note text,
    created_at timestamptz not null default now()
);

-- 일정 완료 기록 (언제, 누가)
alter table public.events add column if not exists done_at timestamptz;
alter table public.events add column if not exists done_by text references public.members (id);

-- 물건
create table if not exists public.items (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    location text,
    photo_url text,
    photo_path text,
    picked_by text references public.members (id),
    picked_at timestamptz,
    created_at timestamptz not null default now()
);

-- 접근 권한: 링크를 아는 사람은 누구나 읽고 쓸 수 있음 (로그인 없음)
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.items enable row level security;

drop policy if exists "members_all" on public.members;
create policy "members_all" on public.members for all to anon using (true) with check (true);
drop policy if exists "events_all" on public.events;
create policy "events_all" on public.events for all to anon using (true) with check (true);
drop policy if exists "items_all" on public.items;
create policy "items_all" on public.items for all to anon using (true) with check (true);

-- 실시간 반영 (다른 가족이 바꾸면 바로 화면에 보이도록)
do $$
begin
    begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.events; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.items; exception when duplicate_object then null; end;
end $$;

-- 물건 사진 저장소 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

drop policy if exists "item_photos_read" on storage.objects;
create policy "item_photos_read" on storage.objects for select to anon using (bucket_id = 'item-photos');
drop policy if exists "item_photos_insert" on storage.objects;
create policy "item_photos_insert" on storage.objects for insert to anon with check (bucket_id = 'item-photos');
drop policy if exists "item_photos_delete" on storage.objects;
create policy "item_photos_delete" on storage.objects for delete to anon using (bucket_id = 'item-photos');

-- 정리 목록 (대형폐기물·수거요청·분리수거)
create table if not exists public.cleanup (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('bulky', 'pickup', 'recycle')),
    name text not null,
    detail text,
    price integer not null default 0,
    qty integer not null default 1 check (qty > 0),
    done boolean not null default false,
    created_by text references public.members (id),
    created_at timestamptz not null default now()
);

alter table public.cleanup enable row level security;
drop policy if exists "cleanup_all" on public.cleanup;
create policy "cleanup_all" on public.cleanup for all to anon using (true) with check (true);

do $$
begin
    begin alter publication supabase_realtime add table public.cleanup; exception when duplicate_object then null; end;
end $$;
