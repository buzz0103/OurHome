-- 정리 목록 (대형폐기물·수거요청·분리수거)
-- 이미 schema.sql 을 실행했다면 이 파일만 SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전해요.
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
