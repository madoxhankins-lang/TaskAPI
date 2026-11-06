import { Request, Response } from 'express';
import { requireRole } from '../src/middleware/auth';
import { HttpError } from '../src/middleware/errors';
test('requireRole rejects a missing authenticated user', () => {
  expect(() => requireRole('ADMIN')({} as Request, {} as Response, jest.fn())).toThrow(HttpError);
});
test('requireRole continues for ADMIN', () => {
  const next = jest.fn();
  requireRole('ADMIN')({ user: { role: 'ADMIN' } } as Request, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
});
