-- 栖旅 · 数据库结构（Supabase / PostgreSQL）
-- 用法：在 Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 说明：所有表都开了行级权限（RLS）——默认谁也读不到、写不了，
--       下面逐条授权：公开内容人人可读，私人数据只有本人能看能改。

-- ============================================================
-- 1. 用户档案（挂在 auth.users 下面）
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  color       text default '#c8452e',
  home        text,
  -- 官方账号（编辑部）：内容以网站自己的名义发布，界面上会带「官方整理」标记
  official    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists official boolean not null default false;

alter table public.profiles enable row level security;

drop policy if exists "profiles 人人可读" on public.profiles;
create policy "profiles 人人可读" on public.profiles
  for select using (true);

drop policy if exists "profiles 本人可改" on public.profiles;
create policy "profiles 本人可改" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 注册时自动建一条档案（昵称取自注册时填的 name）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, home)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), '旅人'),
    nullif(new.raw_user_meta_data->>'home', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. 帖子 / 回复 / 点赞
-- ============================================================
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author      uuid not null references public.profiles(id) on delete cascade,
  city        text,
  topic       text not null default 'daily',
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_city_idx on public.posts (city);

create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  post        uuid not null references public.posts(id) on delete cascade,
  author      uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists replies_post_idx on public.replies (post);

create table if not exists public.likes (
  post        uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post, user_id)
);

alter table public.posts   enable row level security;
alter table public.replies enable row level security;
alter table public.likes   enable row level security;

-- 登录用户：内容都能读；只能以自己的名义发、只能改删自己的
drop policy if exists "posts 登录可读" on public.posts;
create policy "posts 登录可读" on public.posts
  for select to authenticated using (true);

drop policy if exists "posts 本人可写" on public.posts;
create policy "posts 本人可写" on public.posts
  for insert to authenticated with check (auth.uid() = author);

drop policy if exists "posts 本人可删" on public.posts;
create policy "posts 本人可删" on public.posts
  for delete to authenticated using (auth.uid() = author);

drop policy if exists "replies 登录可读" on public.replies;
create policy "replies 登录可读" on public.replies
  for select to authenticated using (true);

drop policy if exists "replies 本人可写" on public.replies;
create policy "replies 本人可写" on public.replies
  for insert to authenticated with check (auth.uid() = author);

drop policy if exists "likes 登录可读" on public.likes;
create policy "likes 登录可读" on public.likes
  for select to authenticated using (true);

drop policy if exists "likes 本人可写" on public.likes;
create policy "likes 本人可写" on public.likes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "likes 本人可删" on public.likes;
create policy "likes 本人可删" on public.likes
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- 3. 私人数据：收藏的城市 / 笔记 / 偏好权重
-- ============================================================
create table if not exists public.saved_cities (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  city        text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, city)
);

create table if not exists public.notes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  city        text not null,
  body        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (user_id, city)
);

create table if not exists public.prefs (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  weights     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.saved_cities enable row level security;
alter table public.notes        enable row level security;
alter table public.prefs        enable row level security;

drop policy if exists "saved 本人" on public.saved_cities;
create policy "saved 本人" on public.saved_cities
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes 本人" on public.notes;
create policy "notes 本人" on public.notes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "prefs 本人" on public.prefs;
create policy "prefs 本人" on public.prefs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 4. 游客能看的那一点点（注册才能看更多，这条在服务端执行）
-- ============================================================
-- 注意：改了返回列就不能用 create or replace，必须先 drop
drop function if exists public.guest_posts(int);
create function public.guest_posts(max_rows int default 3)
returns table (
  id uuid, city text, topic text, body text, created_at timestamptz,
  author uuid, author_name text, author_color text, author_home text,
  author_official boolean, likes bigint
)
language sql security definer set search_path = public as $$
  -- 先按城市各取最新一条，再挑最新的 max_rows 条：
  -- 这样只有 3 个名额的游客也能看到 3 座不同城市，而不是同一座城市连刷三条。
  select t.id, t.city, t.topic, t.body, t.created_at,
         t.author, t.author_name, t.author_color, t.author_home, t.author_official, t.likes
  from (
    select distinct on (coalesce(p.city, ''))
           p.id, p.city, p.topic, p.body, p.created_at,
           p.author, pr.name as author_name, pr.color as author_color, pr.home as author_home,
           pr.official as author_official,
           (select count(*) from public.likes l where l.post = p.id) as likes
    from public.posts p
    join public.profiles pr on pr.id = p.author
    order by coalesce(p.city, ''), p.created_at desc
  ) t
  order by t.created_at desc
  limit greatest(1, least(max_rows, 3));
$$;

revoke all on function public.guest_posts(int) from public;
grant execute on function public.guest_posts(int) to anon, authenticated;

-- 登录用户读帖子时，顺便把作者信息和点赞数一起带出来（省一次请求）
-- create or replace 只能往末尾加列，所以新列 author_official 放在最后
create or replace view public.posts_feed as
  select p.id, p.city, p.topic, p.body, p.created_at,
         p.author, pr.name as author_name, pr.color as author_color, pr.home as author_home,
         (select count(*) from public.likes l where l.post = p.id) as likes,
         (select count(*) from public.replies r where r.post = p.id) as replies,
         pr.official as author_official
  from public.posts p
  join public.profiles pr on pr.id = p.author;

grant select on public.posts_feed to authenticated;
