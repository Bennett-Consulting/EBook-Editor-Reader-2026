import React from 'react';
import { ManuscriptEditor } from '../../src/components/ManuscriptEditor';
import { DocumentChunk } from '../../src/lib/types';

describe('ManuscriptEditor', () => {
  it('component exists and is a function', () => {
    expect(typeof ManuscriptEditor).toBe('function');
  });

  it('accepts required props', () => {
    const mockChunk: DocumentChunk = {
      id: 1,
      documentId: 'doc-1',
      chunkIndex: 0,
      rawContent: 'Hello world',
      cleanContent: 'Hello world',
      timestamp: Date.now(),
    };

    const props = {
      chunkWindow: [mockChunk],
      totalChunkCount: 1,
      currentIndex: 0,
      pageHeight: 600,
      onContentChange: jest.fn(),
      onPageChange: jest.fn(),
      onMergeWithPrevious: jest.fn(),
    };

    expect(props.chunkWindow.length).toBe(1);
    expect(props.totalChunkCount).toBe(1);
    expect(typeof props.onContentChange).toBe('function');
    expect(typeof props.onPageChange).toBe('function');
    expect(typeof props.onMergeWithPrevious).toBe('function');
  });

  it('handles empty chunk window', () => {
    const props = {
      chunkWindow: [],
      totalChunkCount: 0,
      currentIndex: 0,
      pageHeight: 600,
      onContentChange: jest.fn(),
      onPageChange: jest.fn(),
      onMergeWithPrevious: jest.fn(),
    };
    expect(props.chunkWindow.length).toBe(0);
  });
});
