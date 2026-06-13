# Reflow Behavior Documentation

## Verified Behaviors

### Text Preservation
- Text split into pages rejoins to original text (whitespace-normalized)
- 100 random iterations verified passing
- Edge cases: empty string, long words, tiny containers, newlines-only

### Monotonicity
- Shorter text produces equal or fewer pages
- Single character removal does not increase page count by more than 1

### Metrics Consistency
- `charsPerLine * linesPerPage === estimatedCharsPerPage` for all container sizes
- Positive metrics for all containers >= 100x100

### Edge Case Behavior
- Empty string: returns `['']`
- Single space: returns `['']` (trimmed to empty)
- Only newlines: returns at least 1 page
- 10,000-character word: splits correctly
- Tiny container (10x10): returns at least 1 page

## What Happens When...

### User types at page boundary
- Character added to current page
- If page overflows, text moves to next page
- Subsequent pages reflow from edit point

### User deletes across page boundary
- Text from next page pulled back into current page
- If current page now underflows, previous page text may flow forward
- Reflow starts from the earlier of the two affected pages

### Device orientation changes
- **NOT CURRENTLY SUPPORTED** — would require full repagination
- All pages recalculated with new dimensions

### User changes font size
- **NOT CURRENTLY SUPPORTED** — would require full repagination
- All pages recalculated with new metrics

## Known Limitations

1. CJK/Emoji width: Uses Latin character width ratios
2. RTL text: No bidirectional support
3. Images: No inline image support
4. Tables: No special table formatting
5. Dynamic sizing: Full repagination required on any metric change

## Verified: npx jest --verbose __tests__/lib/paginationEngine.hardened.test.ts returned 114 PASS on 2026-06-01
