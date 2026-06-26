const express = require('express');
const passport = require('passport');
const session = require('express-session');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// Session configuration — missing all security flags
// Problems:
//   - No HttpOnly flag (JS can read session cookie → XSS session theft)
//   - No Secure flag (cookie sent over plain HTTP)
//   - No SameSite flag (CSRF attacks possible)
//   - Hardcoded weak secret
//   - No session expiration
// ---------------------------------------------------------------
app.use(
  session({
    secret: 'my-secret-key',  // hardcoded, weak secret
    resave: true,               // forces re-save even if unmodified
    saveUninitialized: true,    // saves empty sessions
    cookie: {
      // Intentionally missing all security flags:
      // httpOnly: false (default) — JS accessible
      // secure: false (default) — sent over HTTP
      // sameSite: not set — vulnerable to CSRF
      // maxAge: not set — session cookie, no expiry
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// In-memory user store (no DB, no persistence)
const users = new Map();
// Token store: maps userId -> token (tokens never expire)
const tokens = new Map();
// No login attempt tracking — unlimited brute force attempts allowed
const LOGIN_ATTEMPT_LIMIT = Infinity; // no limit

// ---------------------------------------------------------------
// POST /register — create a new user
// Problems:
//   - No password strength validation
//   - No rate limiting
//   - No audit logging
//   - Passwords stored in plaintext
// ---------------------------------------------------------------
app.post('/register', (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (users.has(username)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  // Storing password in plaintext — no hashing
  users.set(username, {
    username,
    password, // plaintext password stored directly
    email: email || null,
    createdAt: new Date().toISOString(),
  });

  // No audit log for registration
  res.json({ success: true, message: 'User registered' });
});

// ---------------------------------------------------------------
// POST /login — authenticate a user
// Problems:
//   - No brute force protection (unlimited attempts)
//   - No account lockout after failed attempts
//   - No audit logging for login events (success or failure)
//   - Plaintext password comparison
//   - No 2FA support
// ---------------------------------------------------------------
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.get(username);
  if (!user || user.password !== password) {
    // No logging of failed login attempt
    // No rate limiting — attacker can try unlimited passwords
    // No incremental delay or account lockout
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create session — no expiry, no secure flags (configured globally above)
  req.session.userId = username;
  req.session.loginTime = new Date().toISOString();

  // Generate a bearer token — never expires
  const token = `tok_${username}_${Date.now()}`;
  tokens.set(username, token);

  // No audit log for successful login
  res.json({
    success: true,
    token,
    message: 'Logged in',
  });
});

// ---------------------------------------------------------------
// POST /token — issue a new bearer token
// Problems:
//   - Tokens never expire
//   - No rotation (old tokens stay valid)
//   - No scope/permission system
//   - No rate limiting
// ---------------------------------------------------------------
app.post('/token', (req, res) => {
  const { username, password } = req.body;

  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // New token, but old token is never revoked — both stay valid
  const token = `tok_${username}_${Date.now()}`;
  tokens.set(username, token);

  // Token has no expiration field, no TTL, no refresh mechanism
  res.json({
    success: true,
    token,
    // No expires_in field — token is valid forever
  });
});

// ---------------------------------------------------------------
// GET /me — return current user from session
// Problems:
//   - No authentication middleware check
//   - Returns full user object including password
// ---------------------------------------------------------------
app.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = users.get(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Returns full user object including plaintext password
  res.json(user);
});

// ---------------------------------------------------------------
// POST /logout — destroy session
// Problems:
//   - Token not revoked (stays valid forever)
//   - No audit logging
// ---------------------------------------------------------------
app.post('/logout', (req, res) => {
  const userId = req.session.userId;
  req.session.destroy(() => {
    // Token stays valid — no revocation
    // No audit log for logout
    res.json({ success: true, message: 'Logged out' });
  });
});

// ---------------------------------------------------------------
// No authentication middleware for protected routes
// No CSRF protection
// No rate limiting anywhere
// No security headers (helmet, etc.)
// No input sanitization
// ---------------------------------------------------------------

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});

module.exports = app;
