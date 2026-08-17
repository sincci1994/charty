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
  gender text,                               -- 남성/여성 | null(선택 안 함) — 아바타 성별 세트용
  markets text[] not null default '{}',      -- 국내주식/해외주식/코인 (중복)
  instruments text[] not null default '{}',  -- 현물/선물/옵션 (중복)
  style text,                                -- 단타/스윙/장기투자
  experience text,                           -- 입문/1년 미만/1~3년/3년 이상
  updated_at timestamptz not null default now()
);

-- 기존 배포 테이블 마이그레이션 (create if not exists는 컬럼을 추가하지 않음)
alter table public.profiles add column if not exists gender text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id);

-- R13 상태 동기화 — 잔고·진행 세션·커스텀 스타일은 기록(records)과 달리 "현재 값" 하나뿐이라
-- 유저당 1행 LWW(updated_at은 클라이언트 시각 — 본인 기기끼리의 비교라 서버 시계 불필요)
create table if not exists public.state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,           -- { balance, activeSim, customs, welcomed, waitlistAt } (src/lib/sync.ts SyncedState)
  updated_at timestamptz not null
);

alter table public.state enable row level security;

drop policy if exists "state_select_own" on public.state;
drop policy if exists "state_insert_own" on public.state;
drop policy if exists "state_update_own" on public.state;
drop policy if exists "state_delete_own" on public.state;
create policy "state_select_own" on public.state for select using (auth.uid() = user_id);
create policy "state_insert_own" on public.state for insert with check (auth.uid() = user_id);
create policy "state_update_own" on public.state for update using (auth.uid() = user_id);
create policy "state_delete_own" on public.state for delete using (auth.uid() = user_id);
