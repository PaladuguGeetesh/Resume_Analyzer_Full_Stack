const request = require('supertest')
const app = require('../src/app')
const { registerUser } = require('./setup')

describe('auth flow', () => {
  it('POST /api/v1/auth/register succeeds and never returns the password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ username: 'alice', email: 'alice@example.com' })
    expect(res.body.user.password).toBeUndefined()
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('POST /api/v1/auth/login with valid credentials sets a token cookie', async () => {
    await registerUser(app, {
      username: 'bob',
      email: 'bob@example.com',
      password: 'password123',
    })

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'bob@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/token=/)
  })

  // NOTE: the actual loginUserController responds 400 (not 401) for bad credentials —
  // 401 is what authUser returns for a missing/invalid/blacklisted token on protected
  // routes, which is a separate code path exercised below. This test asserts the real,
  // current behavior; flagging the mismatch with the ticket's literal wording rather than
  // silently changing the controller's status code as a side effect of adding tests.
  it('POST /api/v1/auth/login with invalid credentials is rejected (400)', async () => {
    await registerUser(app, {
      username: 'carol',
      email: 'carol@example.com',
      password: 'password123',
    })

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'carol@example.com',
      password: 'wrong-password',
    })

    expect(res.status).toBe(400)
  })

  it('logout blacklists the token (Day 3 Redis behavior): a protected route with the same token then returns 401', async () => {
    const { cookie } = await registerUser(app)

    const meBefore = await request(app).get('/api/v1/auth/get-me').set('Cookie', cookie)
    expect(meBefore.status).toBe(200)

    const logoutRes = await request(app).get('/api/v1/auth/logout').set('Cookie', cookie)
    expect(logoutRes.status).toBe(200)

    const meAfter = await request(app).get('/api/v1/auth/get-me').set('Cookie', cookie)
    expect(meAfter.status).toBe(401)
  })
})
