# Task

## Goal
Ensure the Admin employee table always receives the built-in employee records when a database already contains other records, and make the backfill safe for existing employee data.

## User flow
Admin signs in and opens Admin Settings → Employees. Built-in employee records and existing custom employees appear in the table.

## In scope
- Backfill missing built-in employee records during schema initialization in PostgreSQL and SQLite.
- Preserve any existing row with the same email; do not overwrite names, roles, permissions, or passwords.
- Keep the operation idempotent across restarts.
- Add a focused regression test.

## Out of scope
- Frontend redesign, authentication changes, employee import/sync between browsers, or edits to production database records.

## Design and behavior requirements
- Use insert-if-absent semantics per built-in employee, rather than seeding only when the entire table is empty.
- Include the same built-in employee set on the server as the frontend.

## Acceptance criteria
- A database with a non-empty employees table missing built-in records receives the missing built-in records at initialization.
- Existing built-in/custom records are not overwritten.
- Repeated initialization does not create duplicates or change existing data.
- The Admin employee endpoint returns the built-in employees after initialization.

## Verification required
- Run the focused regression test and the full `npm test` suite.
- Report exact results and any environment limitation.
