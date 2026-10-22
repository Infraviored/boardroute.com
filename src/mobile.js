import { useSyncExternalStore } from 'react';

// The one definition of "phone layout": a narrow window, or a phone held sideways (short and
// touch). Every CSS block for phones uses `@media ${MOBILE_MQ}` and every JS check isMobile(),
// so the two never disagree. (index.css cannot import it and repeats the string; keep in sync.)
export const MOBILE_MQ = '(max-width: 768px), (max-height: 500px) and (pointer: coarse)';

// A phone held sideways: little height, the top bar goes to one row and side by side layouts
// replace stacked ones. Always a subset of MOBILE_MQ.
export const LANDSCAPE_MQ = '(max-height: 500px) and (orientation: landscape) and (pointer: coarse), (max-width: 768px) and (max-height: 500px) and (orientation: landscape)';

// Touch as the main input: bigger hit areas, no hover-only hints, no "Ctrl+V".
export const TOUCH_MQ = '(pointer: coarse)';

export const matches = (q) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
export const isMobile = () => matches(MOBILE_MQ);
export const isTouch = () => matches(TOUCH_MQ);

function subscribe(q) {
  return (cb) => {
    const m = window.matchMedia?.(q);
    m?.addEventListener('change', cb);
    return () => m?.removeEventListener('change', cb);
  };
}
const subMobile = subscribe(MOBILE_MQ);
const subTouch = subscribe(TOUCH_MQ);

/** true while the phone layout is active; re-renders on rotation / resize */
export const useIsMobile = () => useSyncExternalStore(subMobile, isMobile, () => false);
/** true on a touch-first device */
export const useIsTouch = () => useSyncExternalStore(subTouch, isTouch, () => false);
