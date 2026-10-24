-- Afterglow feedback: run once in Supabase → SQL Editor. Anonymous visitors may INSERT only (no read/update/delete);
-- the nightly job reads with the service key (bypasses RLS).
create table if not exists public.feedback (
  id text primary key check (length(id) between 8 and 64),
  created_at timestamptz not null default now(),
  spot text not null check (length(spot) <= 40),
  mode text not null check (mode in ('sunset','sunrise')),
  saved_at timestamptz, shot_at timestamp, view_t timestamptz, day smallint check (day between 0 and 15),
  rating smallint check (rating between 0 and 100),
  accuracy text check (length(accuracy) <= 40),
  notes text check (length(notes) <= 2000),
  photo_path text check (photo_path is null or (length(photo_path) <= 200 and photo_path ~ '^[0-9-]{10}/[a-z0-9_-]+-[A-Za-z0-9-]+\.jpg$')),
  app_version text check (length(app_version) <= 20),
  pred jsonb check (pred is null or pg_column_size(pred) < 2000),
  processed_at timestamptz
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (id, spot, mode, saved_at, shot_at, view_t, day, rating, accuracy, notes, photo_path, app_version, pred) on public.feedback to anon;
drop policy if exists feedback_anon_insert on public.feedback;
create policy feedback_anon_insert on public.feedback for insert to anon with check (processed_at is null);

-- Storage: private bucket (not publicly readable), JPEG only, 1.5 MB max.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 1572864, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1572864, allowed_mime_types = array['image/jpeg'];
drop policy if exists feedback_anon_upload on storage.objects;
create policy feedback_anon_upload on storage.objects for insert to anon
  with check (bucket_id = 'feedback' and name ~ '^[0-9-]{10}/[a-z0-9_-]+-[A-Za-z0-9-]+\.jpg$');
-- No select/update/delete policies for anon: uploads can't be listed, read, overwritten or removed from the app.
