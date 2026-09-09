-- Analytics events are written only by trusted Edge Functions through the
-- service-role client. Recreating this function in a later migration restored
-- default EXECUTE privileges, so revoke the browser-facing roles explicitly.
revoke all on function public.record_analytics_event(text, uuid, text, text, jsonb)
from public, anon, authenticated;

grant execute on function public.record_analytics_event(text, uuid, text, text, jsonb)
to service_role;
