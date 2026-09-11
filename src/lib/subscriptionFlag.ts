// Subscriptions have been retired: treat every user as entitled.
//
// Keep the same exports so existing call sites (sync consent, optimistic gates)
// continue to work without coupling the renderer to billing state.
export const readIsSubscribed = (): boolean => true;
export const writeIsSubscribed = (): void => {};
export const clearIsSubscribed = (): void => {};

export const subscribeIsSubscribed = (onChange: () => void): (() => void) => {
  onChange();
  return () => {};
};
