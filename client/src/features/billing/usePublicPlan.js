import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export function usePublicPlan() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    plan: null,
    pending: true,
    error: null,
  });
  const retry = useCallback(() => {
    setState({ plan: null, pending: true, error: null });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // This public GET reads configuration only. Checkout remains an explicit
    // action in Billing; visiting or retrying pricing cannot create a subscription.
    api
      .get("/api/billing/plan")
      .then((plan) => {
        if (!plan?.freeDailyLimits || !plan?.pro?.dailyLimits)
          throw new Error("Plan details are incomplete. Please try again.");
        if (!cancelled) setState({ plan, pending: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            plan: null,
            pending: false,
            error:
              "We couldn’t load current prices and limits. Please try again.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry };
}
