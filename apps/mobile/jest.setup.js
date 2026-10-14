/* global jest */
// Component and navigation tests (jest-expo): native modules without a built-in jest mock.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
