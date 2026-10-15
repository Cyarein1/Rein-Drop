import common from './common.js';
import nav from './nav.js';
import auth from './auth.js';
import access from './access.js';
import deals from './deals.js';
import hunts from './hunts.js';
import inventory from './inventory.js';
import sell from './sell.js';
import notifications from './notifications.js';
import account from './account.js';
import onboarding from './onboarding.js';
import location from './location.js';
import states from './states.js';
import billing from './billing.js';
import analytics from './analytics.js';
import home from './home.js';
import errors from './errors.js';
import push from './push.js';

/** The English (source) catalog, one namespace per area of the product. */
export const en = { common, nav, auth, access, deals, hunts, inventory, sell, notifications, account, onboarding, location, states, billing, analytics, home, errors, push } as const;

/** The shape every language must provide (same namespaces and keys). */
export type Catalog = { readonly [N in keyof typeof en]: { readonly [K in keyof (typeof en)[N]]: string } };
