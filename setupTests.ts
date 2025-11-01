import '@testing-library/jest-dom'

// JSDOM doesn't implement scrollIntoView; many components expect it
// Provide a benign stub so tests can assert it was called
if (!HTMLElement.prototype.scrollIntoView) {
  // eslint-disable-next-line no-extend-native
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
}

