


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."enforce_member_language_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.member_languages where user_id = new.user_id) >= 10 then
    raise exception 'language limit reached';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_member_language_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enqueue_letter_report_received"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  reporter_email text;
  reported_correspondence_id uuid;
  reported_sender_id uuid;
begin
  select reporter.email_address, letter.correspondence_id, letter.sender_id
    into reporter_email, reported_correspondence_id, reported_sender_id
  from public.profiles as reporter
  join public.letters as letter on letter.id = new.letter_id
  where reporter.id = new.reporter_id;

  insert into public.transactional_email_outbox (
    event_type,
    recipient_email,
    member_id,
    letter_id,
    correspondence_id,
    dedupe_key,
    payload
  ) values (
    'letter_report_received',
    'customers@onereader.co',
    new.reporter_id,
    new.letter_id,
    reported_correspondence_id,
    'letter-report-operator/' || new.id::text,
    pg_catalog.jsonb_build_object(
      'reportId', new.id,
      'letterId', new.letter_id,
      'correspondenceId', reported_correspondence_id,
      'reporterId', new.reporter_id,
      'reporterEmail', reporter_email,
      'senderId', reported_sender_id,
      'category', new.category,
      'reportedAt', new.created_at
    )
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "private"."enqueue_letter_report_received"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enqueue_privacy_request_received"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  member_email text;
begin
  select profile.email_address
    into member_email
  from public.profiles as profile
  where profile.id = new.user_id;

  if member_email is not null then
    insert into public.transactional_email_outbox (
      event_type,
      recipient_email,
      member_id,
      dedupe_key,
      payload
    ) values (
      'privacy_request_received',
      member_email,
      new.user_id,
      'privacy-request/' || new.id::text,
      pg_catalog.jsonb_build_object(
        'requestId', new.id,
        'requestType', new.request_type,
        'requestedAt', new.created_at
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."enqueue_privacy_request_received"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_opening_started"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.kind = 'opening' and new.state <> 'failed' then
    insert into public.member_stats (
      user_id,
      correspondences_started_count,
      updated_at
    ) values (
      new.sender_id,
      1,
      now()
    )
    on conflict (user_id) do update
    set correspondences_started_count = public.member_stats.correspondences_started_count + 1,
        updated_at = now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."record_opening_started"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_letter_action"("p_letter_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_category" "text" DEFAULT NULL::"text") RETURNS TABLE("result" "text", "correspondence_status" "text", "report_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_letter public.letters%rowtype;
  v_correspondence public.correspondences%rowtype;
  v_report_id uuid;
begin
  if p_action not in ('stop', 'report') then
    result := 'invalid_action';
    return next;
    return;
  end if;

  if p_action = 'report' and coalesce(p_category, '') not in (
    'sexual_explicit',
    'harassment_threats',
    'hate_discrimination',
    'personal_data',
    'spam_fraud',
    'other'
  ) then
    result := 'invalid_category';
    return next;
    return;
  end if;

  select *
  into v_letter
  from public.letters
  where id = p_letter_id
  for update;

  if not found then
    result := 'letter_not_found';
    return next;
    return;
  end if;

  if v_letter.recipient_id <> p_actor_id then
    result := 'not_recipient';
    return next;
    return;
  end if;

  select *
  into v_correspondence
  from public.correspondences
  where id = v_letter.correspondence_id
  for update;

  if not found then
    result := 'letter_not_found';
    return next;
    return;
  end if;

  insert into public.member_blocks (
    blocker_id,
    blocked_id,
    correspondence_id,
    reason
  ) values (
    p_actor_id,
    v_letter.sender_id,
    v_letter.correspondence_id,
    case when p_action = 'report' then 'reported_letter' else 'correspondence_stopped' end
  )
  on conflict (blocker_id, blocked_id) do update
  set correspondence_id = excluded.correspondence_id,
      reason = case
        when public.member_blocks.reason = 'reported_letter' then public.member_blocks.reason
        else excluded.reason
      end;

  update public.conversation_aliases
  set active = false
  where correspondence_id = v_letter.correspondence_id
    and active;

  if p_action = 'report' then
    insert into public.letter_reports (
      letter_id,
      reporter_id,
      category,
      status
    ) values (
      p_letter_id,
      p_actor_id,
      p_category,
      'open'
    )
    on conflict (letter_id, reporter_id) do update
    set category = excluded.category
    returning id into v_report_id;

    update public.letters
    set state = 'reported',
        updated_at = now()
    where id = p_letter_id;

    update public.correspondences
    set status = 'reported',
        closed_at = coalesce(closed_at, now()),
        updated_at = now()
    where id = v_letter.correspondence_id;
  else
    update public.letters
    set state = case when state = 'reported' then 'reported' else 'stopped' end,
        updated_at = now()
    where id = p_letter_id;

    update public.correspondences
    set status = case when status = 'reported' then 'reported' else 'stopped' end,
        closed_at = coalesce(closed_at, now()),
        updated_at = now()
    where id = v_letter.correspondence_id;
  end if;

  result := case when p_action = 'report' then 'reported' else 'stopped' end;
  select status into correspondence_status
  from public.correspondences
  where id = v_letter.correspondence_id;
  report_id := v_report_id;
  return next;
end;
$$;


ALTER FUNCTION "public"."apply_letter_action"("p_letter_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_category" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."mail_jobs" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "provider_event_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_until" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "mail_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "mail_jobs_kind_check" CHECK (("kind" = ANY (ARRAY['process_inbound'::"text", 'send_letter'::"text", 'send_notice'::"text"]))),
    CONSTRAINT "mail_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'retry'::"text", 'completed'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."mail_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_mail_jobs"("p_limit" integer DEFAULT 5) RETURNS SETOF "public"."mail_jobs"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with claimable as (
    select id
    from public.mail_jobs
    where available_at <= now()
      and (
        status in ('pending', 'retry')
        or (status = 'processing' and locked_until < now())
      )
    order by available_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.mail_jobs as job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_until = now() + interval '2 minutes'
  from claimable
  where job.id = claimable.id
  returning job.*;
$$;


ALTER FUNCTION "public"."claim_mail_jobs"("p_limit" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactional_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "recipient_email" "text",
    "member_id" "uuid",
    "letter_id" "uuid",
    "correspondence_id" "uuid",
    "dedupe_key" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_until" timestamp with time zone,
    "provider_outbound_id" "text",
    "rendered_subject" "text",
    "rendered_html" "text",
    "rendered_text" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "transactional_email_outbox_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "transactional_email_outbox_dedupe_key_check" CHECK ((("length"("dedupe_key") >= 1) AND ("length"("dedupe_key") <= 500))),
    CONSTRAINT "transactional_email_outbox_event_type_check" CHECK (("event_type" = ANY (ARRAY['unknown_sender'::"text", 'account_verification_required'::"text", 'waitlist_not_open'::"text", 'profile_incomplete'::"text", 'minimum_age_not_met'::"text", 'delivery_paused'::"text", 'account_closed'::"text", 'cadence_limited_free'::"text", 'cadence_limited_daily'::"text", 'letter_body_missing'::"text", 'letter_too_long'::"text", 'attachments_removed'::"text", 'opening_waiting_for_reader'::"text", 'opening_failed'::"text", 'opening_delivered'::"text", 'reply_not_delivered'::"text", 'privacy_request_received'::"text", 'letter_report_received'::"text", 'membership_activated'::"text", 'renewal_upcoming'::"text", 'refund_request_received'::"text"]))),
    CONSTRAINT "transactional_email_outbox_payload_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "transactional_email_outbox_recipient_email_check" CHECK ((("recipient_email" IS NULL) OR (("recipient_email" = "lower"("btrim"("recipient_email"))) AND (("length"("recipient_email") >= 3) AND ("length"("recipient_email") <= 320)) AND (POSITION(('@'::"text") IN ("recipient_email")) > 1)))),
    CONSTRAINT "transactional_email_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'retry'::"text", 'previewed'::"text", 'sent'::"text", 'dead'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."transactional_email_outbox" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_transactional_emails"("p_limit" integer DEFAULT 10) RETURNS SETOF "public"."transactional_email_outbox"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with claimable as (
    select id
    from public.transactional_email_outbox
    where available_at <= now()
      and (
        status in ('pending', 'retry')
        or (status = 'processing' and locked_until < now())
      )
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.transactional_email_outbox as email
  set status = 'processing',
      attempts = email.attempts + 1,
      locked_until = now() + interval '2 minutes'
  from claimable
  where email.id = claimable.id
  returning email.*;
$$;


ALTER FUNCTION "public"."claim_transactional_emails"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_mail_job"("p_job_id" bigint) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.mail_jobs
  set status = 'completed',
      locked_until = null,
      completed_at = now(),
      last_error = null
  where id = p_job_id;
$$;


ALTER FUNCTION "public"."complete_mail_job"("p_job_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_transactional_email"("p_email_id" "uuid", "p_provider_outbound_id" "text", "p_rendered_subject" "text", "p_rendered_html" "text", "p_rendered_text" "text", "p_preview" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.transactional_email_outbox
  set status = case when p_preview then 'previewed' else 'sent' end,
      recipient_email = case when event_type = 'unknown_sender' then null else recipient_email end,
      locked_until = null,
      provider_outbound_id = p_provider_outbound_id,
      rendered_subject = p_rendered_subject,
      rendered_html = p_rendered_html,
      rendered_text = p_rendered_text,
      last_error = null,
      processed_at = now()
  where id = p_email_id;
$$;


ALTER FUNCTION "public"."complete_transactional_email"("p_email_id" "uuid", "p_provider_outbound_id" "text", "p_rendered_subject" "text", "p_rendered_html" "text", "p_rendered_text" "text", "p_preview" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_privacy_operator_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.request_type in ('access', 'rectification') then
    insert into public.transactional_email_outbox (
      event_type, recipient_email, member_id, dedupe_key, payload
    )
    select
      'privacy_request_received',
      'customers@onereader.co',
      new.user_id,
      'privacy-operator/' || new.id,
      jsonb_build_object(
        'requestId', new.id,
        'requestType', new.request_type,
        'requestedAt', new.created_at,
        'operatorNotification', true
      )
    where exists (
      select 1 from public.profiles p
      where p.id = new.user_id
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."queue_privacy_operator_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_letter_failure"("p_letter_id" "uuid", "p_reason" "text", "p_bounced" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.letters
  set state = case when p_bounced then 'bounced' else 'failed' end,
      bounced_at = case when p_bounced then now() else bounced_at end,
      failure_reason = left(coalesce(p_reason, 'Delivery failed'), 2000),
      updated_at = now()
  where id = p_letter_id;
$$;


ALTER FUNCTION "public"."record_letter_failure"("p_letter_id" "uuid", "p_reason" "text", "p_bounced" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_letter_sent"("p_letter_id" "uuid", "p_provider_outbound_id" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.letters
  set state = 'sent',
      provider_outbound_id = p_provider_outbound_id,
      failure_reason = null,
      updated_at = now()
  where id = p_letter_id;
$$;


ALTER FUNCTION "public"."record_letter_sent"("p_letter_id" "uuid", "p_provider_outbound_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_provider_bounce"("p_provider_outbound_id" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.letters
  set state = 'bounced',
      bounced_at = coalesce(bounced_at, now()),
      failure_reason = left(coalesce(p_reason, 'Delivery bounced'), 2000),
      updated_at = now()
  where provider_outbound_id = p_provider_outbound_id;
$$;


ALTER FUNCTION "public"."record_provider_bounce"("p_provider_outbound_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_provider_delivery"("p_provider_outbound_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  delivered_letter public.letters%rowtype;
begin
  select * into delivered_letter
  from public.letters
  where provider_outbound_id = p_provider_outbound_id
  for update;

  if not found then return; end if;
  if delivered_letter.state = 'delivered' then return; end if;

  update public.letters
  set state = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      failure_reason = null,
      updated_at = now()
  where id = delivered_letter.id;

  update public.correspondences
  set status = case when status = 'assigned' then 'delivered' else status end,
      last_exchange_at = now(),
      updated_at = now()
  where id = delivered_letter.correspondence_id;

  insert into public.member_stats (user_id, last_letter_sent_at, updated_at)
  values (delivered_letter.sender_id, now(), now())
  on conflict (user_id) do update
  set last_letter_sent_at = now(), updated_at = now();

  insert into public.member_stats (user_id, last_letter_received_at, updated_at)
  values (delivered_letter.recipient_id, now(), now())
  on conflict (user_id) do update
  set last_letter_received_at = now(), updated_at = now();
end;
$$;


ALTER FUNCTION "public"."record_provider_delivery"("p_provider_outbound_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_opening_letter"("p_correspondence_id" "uuid", "p_letter_id" "uuid", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_language_code" "text", "p_sender_alias_hash" "text", "p_recipient_alias_hash" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") RETURNS TABLE("result" "text", "correspondence_id" "uuid", "letter_id" "uuid", "recipient_id" "uuid", "language_code" "text", "next_available_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  sender_profile public.profiles%rowtype;
  chosen_recipient uuid;
  chosen_language text;
  last_opening_at timestamptz;
  cadence interval;
  today_utc date := (now() at time zone 'UTC')::date;
begin
  perform pg_advisory_xact_lock(hashtext('one-reader-opening-assignment'));

  select * into sender_profile
  from public.profiles
  where id = p_sender_id;

  if not found then
    return query select 'sender_not_found', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.account_status not in ('founding', 'free', 'annual') then
    return query select 'sender_inactive', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.email_verified_at is null then
    return query select 'sender_not_verified', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.service_eligible_at is null
    or sender_profile.adult_pool_eligible_at is null then
    return query select 'sender_profile_incomplete', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.service_eligible_at > today_utc then
    return query select 'sender_too_young', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  cadence := case
    when sender_profile.account_status in ('founding', 'annual') then interval '24 hours'
    else interval '90 days'
  end;

  select max(created_at) into last_opening_at
  from public.letters
  where sender_id = p_sender_id
    and kind = 'opening'
    and state not in ('failed');

  if last_opening_at is not null and last_opening_at + cadence > now() then
    return query select 'cadence_limited', null::uuid, null::uuid, null::uuid, null::text, last_opening_at + cadence;
    return;
  end if;

  with candidates as (
    select
      candidate.id,
      sender_language.language_code,
      (
        select count(*)
        from public.letters recent_letter
        where recent_letter.recipient_id = candidate.id
          and recent_letter.kind = 'opening'
          and recent_letter.created_at >= now() - interval '30 days'
          and recent_letter.state not in ('failed')
      ) as received_last_30_days,
      exists (
        select 1
        from public.correspondences recent_pair
        where recent_pair.opened_at >= now() - interval '30 days'
          and (
            (recent_pair.starter_id = p_sender_id and recent_pair.recipient_id = candidate.id)
            or (recent_pair.starter_id = candidate.id and recent_pair.recipient_id = p_sender_id)
          )
      ) as is_recent_pair
    from public.profiles candidate
    join public.member_preferences preference on preference.user_id = candidate.id
    join public.member_languages candidate_language on candidate_language.user_id = candidate.id
    join public.member_languages sender_language
      on sender_language.user_id = p_sender_id
     and sender_language.language_code = candidate_language.language_code
    where candidate.id <> p_sender_id
      and candidate.account_status in ('founding', 'free', 'checkout_pending', 'annual')
      and candidate.email_verified_at is not null
      and candidate.service_eligible_at <= today_utc
      and candidate.adult_pool_eligible_at is not null
      and (candidate.adult_pool_eligible_at <= today_utc) = (sender_profile.adult_pool_eligible_at <= today_utc)
      and preference.is_available_to_receive
      and sender_language.willing_to_write
      and candidate_language.willing_to_read
      and (p_language_code is null or sender_language.language_code = p_language_code)
      and not exists (
        select 1 from public.member_blocks block
        where (block.blocker_id = p_sender_id and block.blocked_id = candidate.id)
           or (block.blocker_id = candidate.id and block.blocked_id = p_sender_id)
      )
      and not exists (
        select 1 from public.letters today
        where today.recipient_id = candidate.id
          and today.kind = 'opening'
          and today.created_at >= now() - interval '24 hours'
          and today.state not in ('failed')
      )
  )
  select candidate.id, candidate.language_code
  into chosen_recipient, chosen_language
  from candidates candidate
  order by
    candidate.is_recent_pair asc,
    -ln(greatest(random(), 0.000000001)) * (1 + candidate.received_last_30_days) asc
  limit 1;

  if chosen_recipient is null then
    return query select 'no_candidate', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  insert into public.correspondences (
    id, starter_id, recipient_id, language_code, aliases_expires_at
  ) values (
    p_correspondence_id, p_sender_id, chosen_recipient, chosen_language, now() + interval '30 days'
  );

  insert into public.conversation_aliases (
    correspondence_id, permitted_sender_id, target_member_id, token_hash, expires_at
  ) values
    (p_correspondence_id, p_sender_id, chosen_recipient, p_sender_alias_hash, now() + interval '30 days'),
    (p_correspondence_id, chosen_recipient, p_sender_id, p_recipient_alias_hash, now() + interval '30 days');

  insert into public.letters (
    id,
    correspondence_id,
    sender_id,
    recipient_id,
    kind,
    subject,
    content_ciphertext,
    content_iv,
    wrapped_dek,
    content_key_version,
    attachment_count,
    provider_inbound_id,
    source_message_id
  ) values (
    p_letter_id,
    p_correspondence_id,
    p_sender_id,
    chosen_recipient,
    'opening',
    coalesce(nullif(left(p_subject, 240), ''), 'A letter for you'),
    p_content_ciphertext,
    p_content_iv,
    p_wrapped_dek,
    p_content_key_version,
    greatest(0, p_attachment_count),
    p_provider_inbound_id,
    p_source_message_id
  );

  return query select 'assigned', p_correspondence_id, p_letter_id, chosen_recipient, chosen_language, null::timestamptz;
end;
$$;


ALTER FUNCTION "public"."reserve_opening_letter"("p_correspondence_id" "uuid", "p_letter_id" "uuid", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_language_code" "text", "p_sender_alias_hash" "text", "p_recipient_alias_hash" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_reply_letter"("p_letter_id" "uuid", "p_alias_hash" "text", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") RETURNS TABLE("result" "text", "correspondence_id" "uuid", "letter_id" "uuid", "recipient_id" "uuid", "language_code" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  route public.conversation_aliases%rowtype;
  conversation public.correspondences%rowtype;
begin
  select * into route
  from public.conversation_aliases
  where token_hash = p_alias_hash
  for update;

  if not found or not route.active or route.permitted_sender_id <> p_sender_id then
    return query select 'invalid_alias', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  select * into conversation
  from public.correspondences
  where id = route.correspondence_id
  for update;

  if conversation.status in ('stopped', 'reported', 'direct', 'expired')
     or route.expires_at <= now() then
    update public.conversation_aliases as aliases
    set active = false
    where aliases.correspondence_id = route.correspondence_id;
    return query select 'conversation_closed', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1 from public.member_blocks as block
    where (block.blocker_id = p_sender_id and block.blocked_id = route.target_member_id)
       or (block.blocker_id = route.target_member_id and block.blocked_id = p_sender_id)
  ) then
    return query select 'conversation_blocked', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  insert into public.letters (
    id,
    correspondence_id,
    sender_id,
    recipient_id,
    kind,
    subject,
    content_ciphertext,
    content_iv,
    wrapped_dek,
    content_key_version,
    attachment_count,
    provider_inbound_id,
    source_message_id
  ) values (
    p_letter_id,
    route.correspondence_id,
    p_sender_id,
    route.target_member_id,
    'reply',
    coalesce(nullif(left(p_subject, 240), ''), 'Re: A letter for you'),
    p_content_ciphertext,
    p_content_iv,
    p_wrapped_dek,
    p_content_key_version,
    greatest(0, p_attachment_count),
    p_provider_inbound_id,
    p_source_message_id
  );

  update public.correspondences
  set status = 'open',
      last_exchange_at = now(),
      aliases_expires_at = now() + interval '30 days',
      updated_at = now()
  where id = route.correspondence_id;

  update public.conversation_aliases as aliases
  set active = true,
      expires_at = now() + interval '30 days'
  where aliases.correspondence_id = route.correspondence_id;

  return query
    select 'assigned', route.correspondence_id, p_letter_id, route.target_member_id, conversation.language_code;
end;
$$;


ALTER FUNCTION "public"."reserve_reply_letter"("p_letter_id" "uuid", "p_alias_hash" "text", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retry_mail_job"("p_job_id" bigint, "p_error" "text", "p_delay_seconds" integer DEFAULT 60, "p_max_attempts" integer DEFAULT 8) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.mail_jobs
  set status = case when attempts >= greatest(1, p_max_attempts) then 'dead' else 'retry' end,
      available_at = now() + make_interval(secs => greatest(1, least(p_delay_seconds, 86400))),
      locked_until = null,
      last_error = left(coalesce(p_error, 'Unknown processing error'), 2000)
  where id = p_job_id;
$$;


ALTER FUNCTION "public"."retry_mail_job"("p_job_id" bigint, "p_error" "text", "p_delay_seconds" integer, "p_max_attempts" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retry_transactional_email"("p_email_id" "uuid", "p_error" "text", "p_delay_seconds" integer DEFAULT 60, "p_max_attempts" integer DEFAULT 8) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.transactional_email_outbox
  set status = case when attempts >= greatest(1, p_max_attempts) then 'dead' else 'retry' end,
      available_at = now() + make_interval(secs => greatest(1, least(p_delay_seconds, 86400))),
      locked_until = null,
      last_error = left(coalesce(p_error, 'Unknown processing error'), 2000),
      processed_at = case when attempts >= greatest(1, p_max_attempts) then now() else null end
  where id = p_email_id;
$$;


ALTER FUNCTION "public"."retry_transactional_email"("p_email_id" "uuid", "p_error" "text", "p_delay_seconds" integer, "p_max_attempts" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_transactional_worker_token"("p_token" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    p_token <> '' and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'transactional_worker_token'
        and decrypted_secret = p_token
    ),
    false
  );
$$;


ALTER FUNCTION "public"."verify_transactional_worker_token"("p_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "purpose" "text" NOT NULL,
    "granted" boolean NOT NULL,
    "policy_version" "text" NOT NULL,
    "consent_text" "text" NOT NULL,
    "source" "text" DEFAULT 'signup'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consent_events_purpose_check" CHECK (("purpose" = ANY (ARRAY['terms'::"text", 'waitlist_operational'::"text", 'journal_marketing'::"text", 'privacy_acknowledgement'::"text"])))
);


ALTER TABLE "public"."consent_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "correspondence_id" "uuid" NOT NULL,
    "permitted_sender_id" "uuid" NOT NULL,
    "target_member_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "key_version" smallint DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_aliases_check" CHECK (("permitted_sender_id" <> "target_member_id")),
    CONSTRAINT "conversation_aliases_key_version_check" CHECK (("key_version" > 0)),
    CONSTRAINT "conversation_aliases_token_hash_check" CHECK (("token_hash" ~ '^[a-f0-9]{64}$'::"text"))
);


ALTER TABLE "public"."conversation_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."correspondences" (
    "id" "uuid" NOT NULL,
    "starter_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "language_code" "text" NOT NULL,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_exchange_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "aliases_expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "starter_continue_requested_at" timestamp with time zone,
    "recipient_continue_requested_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "correspondences_check" CHECK (("starter_id" <> "recipient_id")),
    CONSTRAINT "correspondences_language_code_check" CHECK (("language_code" ~ '^[a-z]{2}(-[A-Z]{2})?$'::"text")),
    CONSTRAINT "correspondences_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'delivered'::"text", 'open'::"text", 'stopped'::"text", 'reported'::"text", 'direct'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."correspondences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_provider_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'resend'::"text" NOT NULL,
    "provider_event_id" "text" NOT NULL,
    "provider_email_id" "text",
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "failure_reason" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "email_provider_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'queued'::"text", 'processed'::"text", 'ignored'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_provider_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_address" "text" NOT NULL,
    "source" "text" DEFAULT 'sign_in'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_email_address_check" CHECK ((("email_address" = "lower"("btrim"("email_address"))) AND (("length"("email_address") >= 3) AND ("length"("email_address") <= 320)) AND (POSITION(('@'::"text") IN ("email_address")) > 1))),
    CONSTRAINT "leads_source_check" CHECK (("source" = 'sign_in'::"text"))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."letter_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "letter_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "category" "text",
    "details_ciphertext" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "letter_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."letter_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."letters" (
    "id" "uuid" NOT NULL,
    "correspondence_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "state" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "subject" "text" DEFAULT 'A letter for you'::"text" NOT NULL,
    "content_ciphertext" "text" NOT NULL,
    "content_iv" "text" NOT NULL,
    "wrapped_dek" "text" NOT NULL,
    "content_key_version" smallint DEFAULT 1 NOT NULL,
    "attachment_count" smallint DEFAULT 0 NOT NULL,
    "provider_inbound_id" "text" NOT NULL,
    "source_message_id" "text",
    "provider_outbound_id" "text",
    "delivered_at" timestamp with time zone,
    "bounced_at" timestamp with time zone,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "letters_attachment_count_check" CHECK (("attachment_count" >= 0)),
    CONSTRAINT "letters_check" CHECK (("sender_id" <> "recipient_id")),
    CONSTRAINT "letters_content_key_version_check" CHECK (("content_key_version" > 0)),
    CONSTRAINT "letters_kind_check" CHECK (("kind" = ANY (ARRAY['opening'::"text", 'reply'::"text", 'system'::"text"]))),
    CONSTRAINT "letters_state_check" CHECK (("state" = ANY (ARRAY['assigned'::"text", 'sending'::"text", 'sent'::"text", 'delivered'::"text", 'bounced'::"text", 'failed'::"text", 'stopped'::"text", 'reported'::"text"])))
);


ALTER TABLE "public"."letters" OWNER TO "postgres";


ALTER TABLE "public"."mail_jobs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."mail_jobs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."member_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "correspondence_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_blocks_check" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."member_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_languages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "language_code" "text" NOT NULL,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "willing_to_write" boolean DEFAULT true NOT NULL,
    "willing_to_read" boolean DEFAULT true NOT NULL,
    CONSTRAINT "member_languages_language_code_check" CHECK (("language_code" ~ '^[a-z]{2}(-[A-Z]{2})?$'::"text")),
    CONSTRAINT "member_languages_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 9)))
);


ALTER TABLE "public"."member_languages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_preferences" (
    "user_id" "uuid" NOT NULL,
    "country_code" "text",
    "market_currency" "text",
    "language_code" "text" DEFAULT 'en'::"text" NOT NULL,
    "is_available_to_receive" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_preferences_country_code_check" CHECK ((("country_code" IS NULL) OR ("country_code" ~ '^[A-Z]{2}$'::"text")))
);


ALTER TABLE "public"."member_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_stats" (
    "user_id" "uuid" NOT NULL,
    "correspondences_started_count" integer DEFAULT 0 NOT NULL,
    "correspondences_open_count" integer DEFAULT 0 NOT NULL,
    "last_letter_sent_at" timestamp with time zone,
    "last_letter_received_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_stats_correspondences_open_count_check" CHECK (("correspondences_open_count" >= 0)),
    CONSTRAINT "member_stats_correspondences_started_count_check" CHECK (("correspondences_started_count" >= 0))
);


ALTER TABLE "public"."member_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."privacy_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "privacy_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['access'::"text", 'rectification'::"text", 'deletion'::"text"]))),
    CONSTRAINT "privacy_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'in_progress'::"text", 'completed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."privacy_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "account_status" "text" DEFAULT 'pending_email'::"text" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "waitlist_joined_at" timestamp with time zone,
    "email_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "founding_season_ends_at" timestamp with time zone,
    "subscription_renews_at" timestamp with time zone,
    "email_address" "text",
    "adult_confirmed_at" timestamp with time zone,
    "consecutive_unredeemed_magic_links" smallint DEFAULT 0 NOT NULL,
    "last_magic_link_redeemed_at" timestamp with time zone,
    "last_meaningful_email_activity_at" timestamp with time zone,
    "birth_month" smallint,
    "birth_year" smallint,
    "birth_declared_at" timestamp with time zone,
    "service_eligible_at" "date",
    "adult_pool_eligible_at" "date",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_status" "text",
    "subscription_current_period_end" timestamp with time zone,
    "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "subscription_current_period_start" timestamp with time zone,
    "subscription_currency" "text",
    "subscription_unit_amount" bigint,
    CONSTRAINT "profiles_account_status_check" CHECK (("account_status" = ANY (ARRAY['pending_email'::"text", 'waitlisted'::"text", 'founding'::"text", 'free'::"text", 'checkout_pending'::"text", 'annual'::"text", 'delivery_paused'::"text", 'closed'::"text"]))),
    CONSTRAINT "profiles_age_eligibility_order_check" CHECK ((("service_eligible_at" IS NULL) OR ("adult_pool_eligible_at" > "service_eligible_at"))),
    CONSTRAINT "profiles_birth_details_complete_check" CHECK (((("birth_month" IS NULL) AND ("birth_year" IS NULL) AND ("birth_declared_at" IS NULL) AND ("service_eligible_at" IS NULL) AND ("adult_pool_eligible_at" IS NULL)) OR (("birth_month" IS NOT NULL) AND ("birth_year" IS NOT NULL) AND ("birth_declared_at" IS NOT NULL) AND ("service_eligible_at" IS NOT NULL) AND ("adult_pool_eligible_at" IS NOT NULL)))),
    CONSTRAINT "profiles_birth_month_check" CHECK ((("birth_month" IS NULL) OR (("birth_month" >= 1) AND ("birth_month" <= 12)))),
    CONSTRAINT "profiles_birth_year_check" CHECK ((("birth_year" IS NULL) OR (("birth_year" >= 1900) AND ("birth_year" <= 9999)))),
    CONSTRAINT "profiles_consecutive_unredeemed_magic_links_check" CHECK (("consecutive_unredeemed_magic_links" >= 0)),
    CONSTRAINT "profiles_email_address_lowercase" CHECK ((("email_address" IS NULL) OR ("email_address" = "lower"("email_address")))),
    CONSTRAINT "profiles_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'annual'::"text"]))),
    CONSTRAINT "profiles_subscription_currency_check" CHECK ((("subscription_currency" IS NULL) OR ("subscription_currency" ~ '^[a-z]{3}$'::"text"))),
    CONSTRAINT "profiles_subscription_unit_amount_check" CHECK ((("subscription_unit_amount" IS NULL) OR ("subscription_unit_amount" >= 0)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refund_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "refund_requests_reason_check" CHECK ((("char_length"("reason") >= 10) AND ("char_length"("reason") <= 2000))),
    CONSTRAINT "refund_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['withdrawal_14_day'::"text", 'service_issue'::"text", 'goodwill'::"text"]))),
    CONSTRAINT "refund_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'in_review'::"text", 'approved'::"text", 'rejected'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."refund_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "error" "text"
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'public'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "converted_at" timestamp with time zone,
    CONSTRAINT "waitlist_entries_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'converted'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."waitlist_entries" OWNER TO "postgres";


ALTER TABLE ONLY "public"."consent_events"
    ADD CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_aliases"
    ADD CONSTRAINT "conversation_aliases_correspondence_id_permitted_sender_id_key" UNIQUE ("correspondence_id", "permitted_sender_id");



ALTER TABLE ONLY "public"."conversation_aliases"
    ADD CONSTRAINT "conversation_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_aliases"
    ADD CONSTRAINT "conversation_aliases_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."correspondences"
    ADD CONSTRAINT "correspondences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_provider_events"
    ADD CONSTRAINT "email_provider_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_provider_events"
    ADD CONSTRAINT "email_provider_events_provider_provider_event_id_key" UNIQUE ("provider", "provider_event_id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_email_address_key" UNIQUE ("email_address");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."letter_reports"
    ADD CONSTRAINT "letter_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."letters"
    ADD CONSTRAINT "letters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."letters"
    ADD CONSTRAINT "letters_provider_inbound_id_key" UNIQUE ("provider_inbound_id");



ALTER TABLE ONLY "public"."letters"
    ADD CONSTRAINT "letters_provider_outbound_id_key" UNIQUE ("provider_outbound_id");



ALTER TABLE ONLY "public"."mail_jobs"
    ADD CONSTRAINT "mail_jobs_kind_provider_event_id_key" UNIQUE ("kind", "provider_event_id");



ALTER TABLE ONLY "public"."mail_jobs"
    ADD CONSTRAINT "mail_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_blocks"
    ADD CONSTRAINT "member_blocks_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."member_blocks"
    ADD CONSTRAINT "member_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_languages"
    ADD CONSTRAINT "member_languages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_languages"
    ADD CONSTRAINT "member_languages_user_id_language_code_key" UNIQUE ("user_id", "language_code");



ALTER TABLE ONLY "public"."member_preferences"
    ADD CONSTRAINT "member_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."member_stats"
    ADD CONSTRAINT "member_stats_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."privacy_requests"
    ADD CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."transactional_email_outbox"
    ADD CONSTRAINT "transactional_email_outbox_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."transactional_email_outbox"
    ADD CONSTRAINT "transactional_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_user_id_key" UNIQUE ("user_id");



CREATE INDEX "consent_events_user_id_idx" ON "public"."consent_events" USING "btree" ("user_id");



CREATE INDEX "conversation_aliases_lookup_idx" ON "public"."conversation_aliases" USING "btree" ("token_hash") WHERE "active";



CREATE INDEX "conversation_aliases_permitted_sender_idx" ON "public"."conversation_aliases" USING "btree" ("permitted_sender_id");



CREATE INDEX "conversation_aliases_target_member_idx" ON "public"."conversation_aliases" USING "btree" ("target_member_id");



CREATE INDEX "correspondences_pair_recent_idx" ON "public"."correspondences" USING "btree" ("starter_id", "recipient_id", "opened_at" DESC);



CREATE INDEX "correspondences_recipient_opened_idx" ON "public"."correspondences" USING "btree" ("recipient_id", "opened_at" DESC);



CREATE INDEX "correspondences_starter_opened_idx" ON "public"."correspondences" USING "btree" ("starter_id", "opened_at" DESC);



CREATE INDEX "letter_reports_letter_idx" ON "public"."letter_reports" USING "btree" ("letter_id");



CREATE UNIQUE INDEX "letter_reports_letter_reporter_unique" ON "public"."letter_reports" USING "btree" ("letter_id", "reporter_id");



CREATE INDEX "letter_reports_reporter_idx" ON "public"."letter_reports" USING "btree" ("reporter_id");



CREATE INDEX "letters_correspondence_created_idx" ON "public"."letters" USING "btree" ("correspondence_id", "created_at");



CREATE INDEX "letters_recipient_opening_idx" ON "public"."letters" USING "btree" ("recipient_id", "created_at" DESC) WHERE ("kind" = 'opening'::"text");



CREATE INDEX "letters_sender_opening_idx" ON "public"."letters" USING "btree" ("sender_id", "created_at" DESC) WHERE ("kind" = 'opening'::"text");



CREATE INDEX "mail_jobs_available_idx" ON "public"."mail_jobs" USING "btree" ("available_at", "id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'retry'::"text", 'processing'::"text"]));



CREATE INDEX "mail_jobs_provider_event_idx" ON "public"."mail_jobs" USING "btree" ("provider_event_id");



CREATE INDEX "member_blocks_correspondence_idx" ON "public"."member_blocks" USING "btree" ("correspondence_id") WHERE ("correspondence_id" IS NOT NULL);



CREATE INDEX "member_blocks_reverse_idx" ON "public"."member_blocks" USING "btree" ("blocked_id", "blocker_id");



CREATE UNIQUE INDEX "privacy_requests_one_active_deletion_per_user" ON "public"."privacy_requests" USING "btree" ("user_id") WHERE (("request_type" = 'deletion'::"text") AND ("status" = ANY (ARRAY['requested'::"text", 'in_progress'::"text"])));



CREATE INDEX "privacy_requests_user_id_idx" ON "public"."privacy_requests" USING "btree" ("user_id");



CREATE INDEX "profiles_age_pool_eligibility_idx" ON "public"."profiles" USING "btree" ("service_eligible_at", "adult_pool_eligible_at") WHERE ("service_eligible_at" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_email_address_unique" ON "public"."profiles" USING "btree" ("email_address") WHERE ("email_address" IS NOT NULL);



CREATE INDEX "profiles_stripe_customer_idx" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "profiles_stripe_subscription_idx" ON "public"."profiles" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "transactional_email_outbox_available_idx" ON "public"."transactional_email_outbox" USING "btree" ("available_at", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'retry'::"text", 'processing'::"text"]));



CREATE INDEX "transactional_email_outbox_correspondence_idx" ON "public"."transactional_email_outbox" USING "btree" ("correspondence_id") WHERE ("correspondence_id" IS NOT NULL);



CREATE INDEX "transactional_email_outbox_letter_idx" ON "public"."transactional_email_outbox" USING "btree" ("letter_id") WHERE ("letter_id" IS NOT NULL);



CREATE INDEX "transactional_email_outbox_member_idx" ON "public"."transactional_email_outbox" USING "btree" ("member_id", "created_at" DESC) WHERE ("member_id" IS NOT NULL);



CREATE INDEX "transactional_email_outbox_renewal_idx" ON "public"."transactional_email_outbox" USING "btree" ("member_id", "available_at") WHERE (("event_type" = 'renewal_upcoming'::"text") AND ("status" = ANY (ARRAY['pending'::"text", 'retry'::"text", 'processing'::"text"])));



CREATE OR REPLACE TRIGGER "letter_report_operator_notification" AFTER INSERT ON "public"."letter_reports" FOR EACH ROW EXECUTE FUNCTION "private"."enqueue_letter_report_received"();



CREATE OR REPLACE TRIGGER "letters_record_opening_started" AFTER INSERT ON "public"."letters" FOR EACH ROW EXECUTE FUNCTION "private"."record_opening_started"();



CREATE OR REPLACE TRIGGER "member_languages_limit_trigger" BEFORE INSERT ON "public"."member_languages" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_member_language_limit"();



CREATE OR REPLACE TRIGGER "privacy_request_operator_notification" AFTER INSERT ON "public"."privacy_requests" FOR EACH ROW EXECUTE FUNCTION "public"."queue_privacy_operator_notification"();



CREATE OR REPLACE TRIGGER "privacy_request_transactional_email" AFTER INSERT ON "public"."privacy_requests" FOR EACH ROW EXECUTE FUNCTION "private"."enqueue_privacy_request_received"();



ALTER TABLE ONLY "public"."consent_events"
    ADD CONSTRAINT "consent_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_aliases"
    ADD CONSTRAINT "conversation_aliases_correspondence_id_fkey" FOREIGN KEY ("correspondence_id") REFERENCES "public"."correspondences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_aliases"
    ADD CONSTRAINT "conversation_aliases_permitted_sender_id_fkey" FOREIGN KEY ("permitted_sender_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversation_aliases"
    ADD CONSTRAINT "conversation_aliases_target_member_id_fkey" FOREIGN KEY ("target_member_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."correspondences"
    ADD CONSTRAINT "correspondences_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."correspondences"
    ADD CONSTRAINT "correspondences_starter_id_fkey" FOREIGN KEY ("starter_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."letter_reports"
    ADD CONSTRAINT "letter_reports_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "public"."letters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."letter_reports"
    ADD CONSTRAINT "letter_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."letters"
    ADD CONSTRAINT "letters_correspondence_id_fkey" FOREIGN KEY ("correspondence_id") REFERENCES "public"."correspondences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."letters"
    ADD CONSTRAINT "letters_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."letters"
    ADD CONSTRAINT "letters_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."mail_jobs"
    ADD CONSTRAINT "mail_jobs_provider_event_id_fkey" FOREIGN KEY ("provider_event_id") REFERENCES "public"."email_provider_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_blocks"
    ADD CONSTRAINT "member_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_blocks"
    ADD CONSTRAINT "member_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_blocks"
    ADD CONSTRAINT "member_blocks_correspondence_id_fkey" FOREIGN KEY ("correspondence_id") REFERENCES "public"."correspondences"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."member_languages"
    ADD CONSTRAINT "member_languages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_preferences"
    ADD CONSTRAINT "member_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_stats"
    ADD CONSTRAINT "member_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."privacy_requests"
    ADD CONSTRAINT "privacy_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactional_email_outbox"
    ADD CONSTRAINT "transactional_email_outbox_correspondence_id_fkey" FOREIGN KEY ("correspondence_id") REFERENCES "public"."correspondences"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactional_email_outbox"
    ADD CONSTRAINT "transactional_email_outbox_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "public"."letters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactional_email_outbox"
    ADD CONSTRAINT "transactional_email_outbox_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "backend_only_no_member_access" ON "public"."conversation_aliases" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."correspondences" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."email_provider_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."letter_reports" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."letters" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."mail_jobs" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."member_blocks" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_member_access" ON "public"."transactional_email_outbox" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."consent_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consents_insert_own" ON "public"."consent_events" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "consents_select_own" ON "public"."consent_events" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."conversation_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."correspondences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_provider_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_insert_only" ON "public"."leads" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."letter_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."letters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mail_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_languages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_languages_delete_own" ON "public"."member_languages" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "member_languages_insert_own" ON "public"."member_languages" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "member_languages_select_own" ON "public"."member_languages" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "member_languages_update_own" ON "public"."member_languages" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."member_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_stats_select_own" ON "public"."member_stats" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "preferences_insert_own" ON "public"."member_preferences" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "preferences_select_own" ON "public"."member_preferences" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "preferences_update_own" ON "public"."member_preferences" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."privacy_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "privacy_requests_insert_own" ON "public"."privacy_requests" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "privacy_requests_select_own" ON "public"."privacy_requests" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."refund_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refund_requests_select_own" ON "public"."refund_requests" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactional_email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waitlist_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waitlist_select_own" ON "public"."waitlist_entries" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "private"."enforce_member_language_limit"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enqueue_letter_report_received"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enqueue_privacy_request_received"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_opening_started"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."apply_letter_action"("p_letter_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_letter_action"("p_letter_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_category" "text") TO "service_role";



GRANT ALL ON TABLE "public"."mail_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_mail_jobs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_mail_jobs"("p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."transactional_email_outbox" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_transactional_emails"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_transactional_emails"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_mail_job"("p_job_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_mail_job"("p_job_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_transactional_email"("p_email_id" "uuid", "p_provider_outbound_id" "text", "p_rendered_subject" "text", "p_rendered_html" "text", "p_rendered_text" "text", "p_preview" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_transactional_email"("p_email_id" "uuid", "p_provider_outbound_id" "text", "p_rendered_subject" "text", "p_rendered_html" "text", "p_rendered_text" "text", "p_preview" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_privacy_operator_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_privacy_operator_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_letter_failure"("p_letter_id" "uuid", "p_reason" "text", "p_bounced" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_letter_failure"("p_letter_id" "uuid", "p_reason" "text", "p_bounced" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_letter_sent"("p_letter_id" "uuid", "p_provider_outbound_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_letter_sent"("p_letter_id" "uuid", "p_provider_outbound_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_provider_bounce"("p_provider_outbound_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_provider_bounce"("p_provider_outbound_id" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_provider_delivery"("p_provider_outbound_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_provider_delivery"("p_provider_outbound_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_opening_letter"("p_correspondence_id" "uuid", "p_letter_id" "uuid", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_language_code" "text", "p_sender_alias_hash" "text", "p_recipient_alias_hash" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_opening_letter"("p_correspondence_id" "uuid", "p_letter_id" "uuid", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_language_code" "text", "p_sender_alias_hash" "text", "p_recipient_alias_hash" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_reply_letter"("p_letter_id" "uuid", "p_alias_hash" "text", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_reply_letter"("p_letter_id" "uuid", "p_alias_hash" "text", "p_sender_id" "uuid", "p_provider_inbound_id" "text", "p_subject" "text", "p_content_ciphertext" "text", "p_content_iv" "text", "p_wrapped_dek" "text", "p_content_key_version" smallint, "p_attachment_count" smallint, "p_source_message_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retry_mail_job"("p_job_id" bigint, "p_error" "text", "p_delay_seconds" integer, "p_max_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retry_mail_job"("p_job_id" bigint, "p_error" "text", "p_delay_seconds" integer, "p_max_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."retry_transactional_email"("p_email_id" "uuid", "p_error" "text", "p_delay_seconds" integer, "p_max_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retry_transactional_email"("p_email_id" "uuid", "p_error" "text", "p_delay_seconds" integer, "p_max_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_transactional_worker_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_transactional_worker_token"("p_token" "text") TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT ALL ON TABLE "public"."consent_events" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."consent_events" TO "authenticated";



GRANT ALL ON TABLE "public"."conversation_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."correspondences" TO "service_role";



GRANT ALL ON TABLE "public"."email_provider_events" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "service_role";
GRANT INSERT ON TABLE "public"."leads" TO "anon";
GRANT INSERT ON TABLE "public"."leads" TO "authenticated";



GRANT ALL ON TABLE "public"."letter_reports" TO "service_role";



GRANT ALL ON TABLE "public"."letters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mail_jobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mail_jobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mail_jobs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."member_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."member_languages" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."member_languages" TO "authenticated";



GRANT ALL ON TABLE "public"."member_preferences" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."member_preferences" TO "authenticated";



GRANT ALL ON TABLE "public"."member_stats" TO "service_role";
GRANT SELECT ON TABLE "public"."member_stats" TO "authenticated";



GRANT ALL ON TABLE "public"."privacy_requests" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."privacy_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."refund_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."refund_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist_entries" TO "service_role";
GRANT SELECT ON TABLE "public"."waitlist_entries" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































