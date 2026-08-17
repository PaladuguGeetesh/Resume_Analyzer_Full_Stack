// Test double for the 'pdf-parse' package. Tests care about the request/response
// pipeline (auth, IDOR, idempotency), not real PDF text extraction — and real
// pdf-parse would choke on the throwaway buffers supertest .attach()es in tests.
class PDFParse {
  constructor(_buffer) {}

  async getText() {
    return { text: 'mocked resume text extracted from PDF' }
  }
}

module.exports = { PDFParse }
