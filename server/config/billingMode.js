export function validBillingKey(mode, keyId) {
  return ['test', 'live'].includes(mode)
    && new RegExp(`^rzp_${mode}_[A-Za-z0-9]+$`).test(keyId ?? '');
}
