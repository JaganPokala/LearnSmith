import { lazy } from 'react';

// Keep secondary public pages out of the initial homepage download.
export const PricingPage = lazy(() => import('../pages/Pricing.jsx'));
export const HelpPage = lazy(() => import('../pages/Help.jsx'));
