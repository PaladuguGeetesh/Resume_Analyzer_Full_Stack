import '@testing-library/jest-dom';

// jsdom provides its own window.localStorage, but Node's own experimental
// global localStorage can shadow/conflict with it in some environments.
// Explicitly make sure jsdom's real localStorage is what tests see.
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.clear) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    writable: true,
  });
}
