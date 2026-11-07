export function subscriptionMessage(account) {
  if (!account) return "Checking your saved subscription…";
  if (account.tier === "pro" && account.renewalStopped)
    return "Renewal cancelled. Your remaining paid access is still active.";
  if (account.tier === "pro") return "Your Pro allowance is active.";
  return (
    {
      created: "Checkout is ready to continue.",
      authenticated: "Payment setup received. Pro access is not confirmed yet.",
      pending: "Payment needs attention. Refresh your subscription status.",
      halted: "Renewal is paused. Refresh status for the latest details.",
      cancelled: "Renewal has been cancelled.",
      completed: "This subscription has reached its final billing cycle.",
      expired: "This subscription has expired.",
      creating: "Checkout setup is in progress.",
      unknown:
        "Checkout needs confirmation before another subscription can be created.",
    }[account.status] || "You’re on the Free plan."
  );
}

export function paidThroughLabel(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
}
