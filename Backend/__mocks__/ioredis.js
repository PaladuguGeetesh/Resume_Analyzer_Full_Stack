// Manual mock: Jest auto-applies this for every `require('ioredis')` during tests
// (no jest.mock('ioredis') needed per-file), swapping the real client for an
// in-memory one so tests never need a live Redis instance.
module.exports = require('ioredis-mock')
