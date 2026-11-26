(function () {
  try {
    var originalFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : undefined;
    var currentFetch = originalFetch;
    Object.defineProperty(window, 'fetch', {
      get: function () {
        return currentFetch;
      },
      set: function (fn) {
        currentFetch = fn;
      },
      configurable: true,
      enumerable: true
    });
  } catch (error) {
    // Continue if the runtime does not allow redefining fetch.
  }
})();
