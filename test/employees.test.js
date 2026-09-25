const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const db = require('../db');

test('schema initialization backfills missing built-in employees without overwriting existing data', async () => {
  await db.initSchema();

  const originalEmployees = await db.getEmployees(true);
  const originalAdmin = originalEmployees.find((employee) => employee.email === 'admin');
  assert.ok(originalAdmin, 'expected the built-in admin account to exist before the test');

  const customEmail = 'qa-backfill-test@livelighting.com';
  const modifiedAdmin = { ...originalAdmin, name: 'Preserved administrator name' };

  try {
    // Simulate an older, partially populated database with a custom employee.
    await db.deleteEmployee('somchai@livelighting.com');
    await db.saveEmployee(modifiedAdmin);
    await db.saveEmployee({
      name: 'Custom test employee',
      email: customEmail,
      role: 'service',
      password: '123'
    });

    await db.initSchema();
    await db.initSchema();

    const employees = await db.getEmployees();
    const emails = employees.map((employee) => employee.email);

    assert.ok(emails.includes('somchai@livelighting.com'), 'missing built-in employee should be restored');
    assert.ok(emails.includes('tom@livelighting.com'), 'all built-in accounts should be present');
    assert.ok(emails.includes(customEmail), 'existing custom employee should be preserved');
    assert.equal(new Set(emails).size, emails.length, 'repeated initialization must not create duplicates');

    const rawEmployees = await db.getEmployees(true);
    const persistedAdmin = rawEmployees.find((employee) => employee.email === 'admin');
    assert.equal(persistedAdmin.name, 'Preserved administrator name', 'existing employee data must not be overwritten');
    assert.equal(persistedAdmin.password, modifiedAdmin.password, 'existing password must not be overwritten');
  } finally {
    await db.deleteEmployee(customEmail);
    await db.saveEmployee(originalAdmin);
    await db.initSchema();
  }
});
