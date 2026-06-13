module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { isolatedModules: true, tsconfig: { jsx: 'react-jsx' } }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!((react-native.*|@react-native.*|expo.*|@expo.*|react-native-reanimated)/))',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json']
};
