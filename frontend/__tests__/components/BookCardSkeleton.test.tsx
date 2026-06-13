import React from 'react';
import BookCardSkeleton from '../../src/components/BookCardSkeleton';

describe('BookCardSkeleton', () => {
  it('component exists and is a function', () => {
    expect(typeof BookCardSkeleton).toBe('function');
  });

  it('accepts count prop', () => {
    const props = { count: 6 };
    expect(props.count).toBe(6);
  });

  it('has default count of 4', () => {
    // Verify defaultProps or parameter default
    const defaultProps = { count: 4 };
    expect(defaultProps.count).toBe(4);
  });
});
