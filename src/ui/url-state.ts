/**
 * URL state helpers — serialize/parse deep-linkable view into
 * window.location.search. Hash stays dedicated to routing
 * ('#/about', '#/foo' → 404), search handles image + params so
 * a full URL always reflects the current demo state.
 *
 * Shape:
 *   ?image=hw_forest_cat&k=20&sw=0&sb=8&mt=4
 *
 * Any of the param keys (k/sw/sb/mt) are optional — absent means
 * "use the tuned/default value." `image` is the benchmark entry's
 * base name (no .png).
 */

import type { Parameters } from './context/reducer';

export interface UrlState {
  image?: string;
  params: Partial<Pick<Parameters, 'colors' | 'saliencyWeight' | 'salientSeedBudget' | 'mergeThreshold'>>;
}

const KEY_MAP = {
  colors: 'k',
  saliencyWeight: 'sw',
  salientSeedBudget: 'sb',
  mergeThreshold: 'mt',
} as const;

export function parseUrlState(search: string = typeof window !== 'undefined' ? window.location.search : ''): UrlState {
  const sp = new URLSearchParams(search);
  const params: UrlState['params'] = {};
  for (const [field, key] of Object.entries(KEY_MAP) as Array<[keyof typeof KEY_MAP, string]>) {
    const v = sp.get(key);
    if (v != null && v !== '' && !Number.isNaN(Number(v))) {
      params[field] = Number(v);
    }
  }
  return {
    image: sp.get('image') ?? undefined,
    params,
  };
}

export function buildUrlSearch(state: UrlState): string {
  const sp = new URLSearchParams();
  if (state.image) sp.set('image', state.image);
  for (const [field, key] of Object.entries(KEY_MAP) as Array<[keyof typeof KEY_MAP, string]>) {
    const v = state.params[field];
    if (v != null) sp.set(key, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Write state to URL without pushing a history entry. Safe to call often. */
export function replaceUrlState(state: UrlState): void {
  if (typeof window === 'undefined') return;
  const next = window.location.pathname + buildUrlSearch(state) + window.location.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, '', next);
  }
}
