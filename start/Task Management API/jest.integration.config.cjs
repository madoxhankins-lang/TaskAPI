module.exports = {
  preset: 'ts-jest', testEnvironment: 'node',
  testMatch: ['**/test/integration/**/*.test.ts'], setupFiles: ['<rootDir>/test/env.cjs'], testTimeout: 20000
};
