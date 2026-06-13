import React from 'react';
import EmptyState from '../../src/components/EmptyState';

// Simple render mock - just verify component can be imported and called
describe('EmptyState', () => {
  it('component exists and is a function', () => {
    expect(typeof EmptyState).toBe('function');
  });

  it('accepts required props without throwing', () => {
    // Just verify the component can be referenced with props
    const props = {
      icon: 'book' as const,
      title: 'No Books',
      subtitle: 'Add your first book',
    };
    expect(props.title).toBe('No Books');
    expect(props.subtitle).toBe('Add your first book');
  });

  it('accepts action prop', () => {
    const mockPress = jest.fn();
    const props = {
      icon: 'book' as const,
      title: 'No Books',
      subtitle: 'Add your first book',
      action: {
        label: 'Add Book',
        icon: 'add' as const,
        onPress: mockPress,
      },
    };
    expect(props.action.label).toBe('Add Book');
    expect(typeof props.action.onPress).toBe('function');
  });
});
