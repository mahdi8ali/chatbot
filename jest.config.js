/** @type {import('jest').Config} */
const config = {
  // Pure server-side TypeScript logic under test (lib/server/*.ts)
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  // Pick up *.test.ts (and .tsx) files, e.g. under lib/server/__tests__/
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  // Do not scan build/output/vendor directories
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/tests/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        // Align with tsconfig.json but force CommonJS output so Jest can run it
        tsconfig: {
          target: 'ESNext',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          resolveJsonModule: true,
          isolatedModules: true,
          skipLibCheck: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  // Map the "@/..." path alias to the project root (matches tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

module.exports = config;
