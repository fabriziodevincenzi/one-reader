create index transactional_email_outbox_letter_idx
  on public.transactional_email_outbox (letter_id)
  where letter_id is not null;

create index transactional_email_outbox_correspondence_idx
  on public.transactional_email_outbox (correspondence_id)
  where correspondence_id is not null;
