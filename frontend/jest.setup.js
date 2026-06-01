// Define __DEV__ for expo-modules-core
global.__DEV__ = false;

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn(() => ({})),
  withTiming: jest.fn((val) => val),
  withDelay: jest.fn((_, val) => val),
  withRepeat: jest.fn((val) => val),
  Easing: { bezier: jest.fn(() => jest.fn()), inOut: jest.fn(() => jest.fn()), ease: jest.fn() },
  interpolate: jest.fn((val) => val),
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
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios', select: jest.fn((obj: any) => obj.ios || obj.default) },
  Dimensions: { get: jest.fn(() => ({ width: 375, height: 812 })) },
  FlatList: 'FlatList',
  TextInput: 'TextInput',
  NativeSyntheticEvent: jest.fn(),
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

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache', document: '/document' },
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///test',
    write: jest.fn(),
  })),
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-print
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file:///print.pdf' }),
}));
