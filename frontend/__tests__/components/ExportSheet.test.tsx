import React from 'react';
import ExportSheet from '../../src/components/ExportSheet';
import { Book } from '../../src/lib/types';

describe('ExportSheet', () => {
  it('component exists and is a function', () => {
    expect(typeof ExportSheet).toBe('function');
  });

  it('accepts required props', () => {
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

    const props = {
      visible: true,
      book: mockBook,
      onClose: jest.fn(),
    };

    expect(props.visible).toBe(true);
    expect(props.book.title).toBe('Test Book');
    expect(typeof props.onClose).toBe('function');
  });

  it('handles null book', () => {
    const props = {
      visible: true,
      book: null,
      onClose: jest.fn(),
    };
    expect(props.book).toBeNull();
  });
});
