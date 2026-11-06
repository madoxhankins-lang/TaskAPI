process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-only-secret-that-is-at-least-32-characters';
process.env.DATABASE_URL ||= 'postgresql://taskapi:taskapi_local@localhost:5435/taskapi_test';
process.env.REDIS_URL ||= 'redis://localhost:6385/1';
