// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn(() => ({})),
  withTiming: jest.fn((val) => val),
  withDelay: jest.fn((_, val) => val),
  Easing: { bezier: jest.fn(() => jest.fn()) },
  default: {
    View: 'Animated.View',
  },
}));

// Mock react-native
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles: any) => styles },
  TouchableOpacity: 'TouchableOpacity',
  Platform: { OS: 'ios', select: jest.fn((obj: any) => obj.ios || obj.default) },
}));

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  SQLiteDatabase: jest.fn(),
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
