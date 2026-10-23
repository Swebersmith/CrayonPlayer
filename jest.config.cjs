module.exports = {
  testEnvironment: 'jsdom',
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': '<rootDir>/test/transform.cjs' },
};
