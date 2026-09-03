import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

export type AnalyticsEventName =
  | 'signup_started'
  | 'signup_completed'
  | 'email_verified'
  | 'first_letter_sent'
  | 'reply_received'
  | 'subscription_started'
  | 'subscription_cancelled';

/** Records a minimal product event. Call only from an Edge Function. */
export async function recordAnalyticsEvent(
  admin: SupabaseClient,
  eventName: AnalyticsEventName,
  options: {
    userId?: string | null;
    source?: string | null;
    campaign?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  } = {},
) {
  const { error } = await admin.rpc('record_analytics_event', {
    p_event_name: eventName,
    p_user_id: options.userId ?? null,
    p_source: options.source ?? null,
    p_campaign: options.campaign ?? null,
    p_metadata: options.metadata ?? {},
  });
  if (error) throw error;
}
