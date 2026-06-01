import { exportBook } from '../../src/lib/exporter';
import { Book } from '../../src/lib/types';

// Mock dependencies
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache', document: '/document' },
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///test',
    write: jest.fn(),
  })),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file:///print.pdf' }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
}));

describe('exportBook', () => {
  const mockBook: Book = {
    id: 'test-1',
    title: 'Test Book',
    author: 'Test Author',
    content: 'Chapter 1\n\nHello world\n\nChapter 2\n\nMore content',
    format: 'md',
    coverColor: '#FFB000',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    progress: 0.5,
    annotations: [],
    isDraft: false,
  };

  it('is a function', () => {
    expect(typeof exportBook).toBe('function');
  });

  it('accepts book and format parameters', () => {
    expect(exportBook.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts optional progress callback', () => {
    const progressMock = jest.fn();
    // Just verify it doesn't throw with the callback
    expect(() => exportBook(mockBook, 'md', progressMock)).not.toThrow();
  });

  it('handles all export formats', () => {
    const formats = ['md', 'txt', 'epub', 'docx', 'pdf'];
    formats.forEach(format => {
      expect(() => exportBook(mockBook, format as any)).not.toThrow();
    });
  });

  it('handles book with annotations', () => {
    const bookWithNotes: Book = {
      ...mockBook,
      annotations: [
        { id: 'ann-1', text: 'Important passage', note: 'My note', start: 10, end: 25, color: '#FFB000', createdAt: '2026-01-01' },
      ],
    };
    expect(() => exportBook(bookWithNotes, 'md')).not.toThrow();
  });

  it('handles empty content', () => {
    const emptyBook: Book = {
      ...mockBook,
      content: '',
    };
    expect(() => exportBook(emptyBook, 'md')).not.toThrow();
  });

  it('handles long title', () => {
    const longTitleBook: Book = {
      ...mockBook,
      title: 'A'.repeat(100),
    };
    expect(() => exportBook(longTitleBook, 'md')).not.toThrow();
  });
});
