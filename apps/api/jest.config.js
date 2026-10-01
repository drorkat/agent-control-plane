/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Load the decorator metadata polyfill before any spec, so unit tests can
  // import modules that use class-validator/class-transformer decorators (e.g.
  // DTOs) without Nest's bootstrap having run.
  setupFiles: ['reflect-metadata'],
};
