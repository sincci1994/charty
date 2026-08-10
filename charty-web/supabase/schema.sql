-- R11·R12 스키마 — Supabase Dashboard > SQL Editor에서 실행 (전체 재실행 안전: drop policy if exists로 멱등)
-- 서버는 덤 저장소: 기록 전문은 data(jsonb), 스키마의 진실은 클라이언트(src/types.ts SimRecord)

create table if not exists public.records (
  id uuid primary key,                                            -- SimRecord.id (클라이언트 생성 uuid)
  user_id uuid not null references auth.users (id) on delete cascade,
  ended_at timestamptz not null,                                  -- 정렬·조회용 (SimRecord.endedAt)
  data jsonb not null                                             -- SimRecord 전문
);

create index if not exists records_user_ended on public.records (user_id, ended_at desc);

alter table public.records enable row level security;

-- 본인 것만. update 정책 없음 — 기록은 불변(append-only), upsert는 ignoreDuplicates로 insert만 수행
drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_delete_own" on public.records;
create policy "records_select_own" on public.records for select using (auth.uid() = user_id);
create policy "records_insert_own" on public.records for insert with check (auth.uid() = user_id);
create policy "records_delete_own" on public.records for delete using (auth.uid() = user_id);

-- R12 계정 프로필 — 값은 한국어 리터럴 그대로 저장 (앱 관례: 리터럴이 곧 표시 문자열, types.ts 참조)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  age_band text,                             -- '10대'~'60대+' | null(선택 안 함)
  markets text[] not null default '{}',      -- 국내주식/해외주식/코인 (중복)
  instruments text[] not null default '{}',  -- 현물/선물/옵션 (중복)
  style text,                                -- 단타/스윙/장기투자
  experience text,                           -- 입문/1년 미만/1~3년/3년 이상
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id);
