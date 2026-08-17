module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // mongodb-memory-server download/startup + bcrypt hashing can be slow, especially
  // the first run ever (it downloads a real mongod binary once, then caches it)
  testTimeout: 30000,
  moduleNameMapper: {
    '^pdf-parse$': '<rootDir>/tests/mocks/pdf-parse.mock.js',
    '^puppeteer$': '<rootDir>/tests/mocks/puppeteer.mock.js',
    'queues/interview\\.queue$': '<rootDir>/tests/mocks/interview.queue.mock.js',
  },
}
