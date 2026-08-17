const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const request = require('supertest')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'
// groq-sdk validates apiKey eagerly in its constructor (unlike @google/genai, which
// only fails at call time), so ai.service.js's `new Groq(...)` throws at require() time
// for any test file that doesn't otherwise set this — set a harmless default here.
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key'

// Each test FILE gets its own in-memory Mongo instance (setupFilesAfterEnv runs once
// per file) — slightly more startup overhead than a single shared instance, but total
// isolation between suites with no cross-file leakage risk, and --runInBand keeps it cheap.
let mongoServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
})

afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
  jest.clearAllMocks()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

let testUserCounter = 0

// Registers a fresh user via the real /api/v1/auth/register endpoint and returns the
// bits tests need for authenticated requests (id + the Set-Cookie token).
async function registerUser(app, overrides = {}) {
  testUserCounter += 1
  const credentials = {
    username: `user${testUserCounter}_${Date.now()}`,
    email: `user${testUserCounter}_${Date.now()}@example.com`,
    password: 'password123',
    ...overrides,
  }

  const response = await request(app).post('/api/v1/auth/register').send(credentials)

  return {
    id: response.body.user && response.body.user.id,
    username: credentials.username,
    email: credentials.email,
    password: credentials.password,
    cookie: response.headers['set-cookie'],
    response,
  }
}

module.exports = { registerUser }
