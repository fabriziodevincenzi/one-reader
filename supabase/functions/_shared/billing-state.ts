/** Remove paid entitlement, without deleting the member or their correspondence. */
export function inactiveSubscriptionFields(status = 'canceled') {
  return {
    account_status: 'free',
    plan: 'free',
    stripe_subscription_id: null,
    subscription_status: status,
    subscription_current_period_start: null,
    subscription_current_period_end: null,
    subscription_renews_at: null,
    subscription_cancel_at_period_end: false,
    subscription_currency: null,
    subscription_unit_amount: null,
  };
}
