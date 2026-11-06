const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

export function loadRazorpay() {
  if (typeof window.Razorpay === 'function') return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    const timer = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Could not load checkout. Please try again.'));
    }
    script.onload = () => {
      clearTimeout(timer);
      if (typeof window.Razorpay === 'function') resolve(window.Razorpay);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => { scriptPromise = null; throw error; });
  return scriptPromise;
}

export async function openSubscriptionCheckout(checkout, { load = loadRazorpay } = {}) {
  if (!['test', 'live'].includes(checkout?.mode) || !new RegExp(`^rzp_${checkout.mode}_[A-Za-z0-9]+$`).test(checkout.keyId ?? '') || !/^sub_[A-Za-z0-9]+$/.test(checkout.subscriptionId ?? '')) {
    throw new Error('Checkout is unavailable. Refresh the subscription page.');
  }
  const Razorpay = await load();
  return new Promise((resolve, reject) => {
    let settled = false;
    let paymentFailed = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    try {
      const instance = new Razorpay({
        key: checkout.keyId, subscription_id: checkout.subscriptionId,
        name: 'LearnSmith', description: `Pro monthly subscription${checkout.mode === 'test' ? ' · test mode' : ''}`,
        handler: (response) => finish({ status: 'completed', response }),
        modal: { ondismiss: () => finish({ status: paymentFailed ? 'failed' : 'dismissed' }) },
        theme: { color: '#0891b2' },
      });
      instance.on('payment.failed', () => { paymentFailed = true; });
      instance.open();
    } catch { reject(new Error('Could not open checkout. Please try again.')); }
  });
}
