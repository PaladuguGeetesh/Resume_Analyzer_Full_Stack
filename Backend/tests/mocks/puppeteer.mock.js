// Test double for 'puppeteer'. Its real entry point is ESM-only, which Jest's default
// CommonJS transform can't parse — and none of our tests exercise the resume-PDF
// generation path that actually launches a browser, so a trivial stub is enough.
module.exports = {
  launch: async () => {
    throw new Error('puppeteer is mocked in tests — generateResumePdf should not be called here')
  },
}
