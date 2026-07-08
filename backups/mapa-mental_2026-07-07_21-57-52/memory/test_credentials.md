# Test Credentials

## Admin Account
- **Email**: admin@example.com
- **Password**: admin123
- **Role**: admin

## Auth Endpoints
- POST /api/auth/register  (body: email, password, name)
- POST /api/auth/login     (body: email, password) -> returns { user, token }
- GET  /api/auth/me        (Authorization: Bearer <token>)

## Notes
- Auth uses JWT Bearer tokens (stored in localStorage on the frontend).
- Access token TTL: 7 days.
