module.exports = {
  preset: 'ts-jest', testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'], testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
  setupFiles: ['<rootDir>/test/env.cjs'],
  collectCoverageFrom: ['src/controllers/**/*.ts', 'src/middleware/**/*.ts', 'src/lib/cache.ts', 'src/validation.ts']
};
