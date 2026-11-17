# User profile API

Authentication and email remain owned by Clerk. The API resolves the verified
Clerk identity to a local user and stores application-owned profile data.

- `GET /api/v1/users/me` returns the current user's role and profile.
- `PATCH /api/v1/users/me` updates only `display_name`, `university`,
  `department`, and `program`. Each value is optional and bounded; empty text
  clears the field.
- `GET /api/v1/users` and role-update routes remain administrator-only.

Profile updates do not accept or modify Clerk IDs, email addresses, or roles.
