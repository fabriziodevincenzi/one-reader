drop index if exists public.profiles_email_address_unique;

alter table public.profiles
  add constraint profiles_email_address_lowercase
  check (email_address is null or email_address = lower(email_address));

create unique index profiles_email_address_unique
  on public.profiles (email_address)
  where email_address is not null;

create index if not exists consent_events_user_id_idx
  on public.consent_events (user_id);
create index if not exists privacy_requests_user_id_idx
  on public.privacy_requests (user_id);
create index if not exists conversation_aliases_permitted_sender_idx
  on public.conversation_aliases (permitted_sender_id);
create index if not exists conversation_aliases_target_member_idx
  on public.conversation_aliases (target_member_id);
create index if not exists letter_reports_letter_idx
  on public.letter_reports (letter_id);
create index if not exists letter_reports_reporter_idx
  on public.letter_reports (reporter_id);
create index if not exists mail_jobs_provider_event_idx
  on public.mail_jobs (provider_event_id);
create index if not exists member_blocks_correspondence_idx
  on public.member_blocks (correspondence_id)
  where correspondence_id is not null;

create policy "backend_only_no_member_access"
  on public.correspondences for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "backend_only_no_member_access"
  on public.conversation_aliases for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "backend_only_no_member_access"
  on public.letters for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "backend_only_no_member_access"
  on public.member_blocks for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "backend_only_no_member_access"
  on public.letter_reports for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "backend_only_no_member_access"
  on public.email_provider_events for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "backend_only_no_member_access"
  on public.mail_jobs for all
  to anon, authenticated
  using (false)
  with check (false);
