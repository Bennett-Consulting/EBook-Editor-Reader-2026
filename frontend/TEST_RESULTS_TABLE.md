# Test Results Table

| Test Suite | Test Case | Status | Time |
|------------|-----------|--------|------|
| aiGateway | detectProvider › detects OpenAI keys | ? PASS | ~1ms |
| aiGateway | detectProvider › detects Anthropic keys | ? PASS | ~1ms |
| aiGateway | detectProvider › detects Google keys | ? PASS | ~1ms |
| aiGateway | detectProvider › detects Groq keys | ? PASS | ~1ms |
| aiGateway | detectProvider › detects BitNet local | ? PASS | ~1ms |
| aiGateway | detectProvider › returns custom for unknown | ? PASS | ~1ms |
| aiGateway | maskKey › masks long keys | ? PASS | ~1ms |
| aiGateway | maskKey › returns bullets for short keys | ? PASS | ~1ms |
| aiGateway | pickBestModel › picks pro for improve | ? PASS | ~1ms |
| aiGateway | pickBestModel › picks standard for continue | ? PASS | ~1ms |
| paginationEngine | paginate › returns empty string for empty input | ? PASS | ~1ms |
| paginationEngine | paginate › returns single page for short text | ? PASS | ~1ms |
| paginationEngine | paginate › splits long text into multiple pages | ? PASS | ~1ms |
| paginationEngine | paginate › preserves original text approximately | ? PASS | ~1ms |
| paginationEngine | paginate › handles text with many newlines | ? PASS | ~1ms |
| paginationEngine | getPageMetrics › calculates metrics for standard screen | ? PASS | ~1ms |
| paginationEngine | getPageMetrics › handles small screens | ? PASS | ~1ms |
| db | chunksDao › loadWindow calls getAllAsync with correct query | ? PASS | ~1ms |
| db | chunksDao › getCount returns count from getFirstAsync | ? PASS | ~1ms |
| db | chunksDao › bulkInsert uses transaction and deletes old chunks | ? PASS | ~1ms |
| db | chunksDao › updateContent updates clean_content and raw_content | ? PASS | ~1ms |
| db | chunksDao › deleteAllFollowing deletes chunks from index onward | ? PASS | ~1ms |
| db | chunksDao › shiftIndicesDown decrements indices after given index | ? PASS | ~1ms |
| exporter | exportBook › is a function | ? PASS | ~1ms |
| exporter | exportBook › accepts book and format parameters | ? PASS | ~1ms |
| exporter | exportBook › accepts optional progress callback | ? PASS | ~1ms |
| exporter | exportBook › handles all export formats | ? PASS | ~1ms |
| exporter | exportBook › handles book with annotations | ? PASS | ~1ms |
| exporter | exportBook › handles empty content | ? PASS | ~1ms |
| exporter | exportBook › handles long title | ? PASS | ~1ms |
| EmptyState | component exists and is a function | ? PASS | ~1ms |
| EmptyState | accepts required props without throwing | ? PASS | ~1ms |
| EmptyState | accepts action prop | ? PASS | ~1ms |
| ManuscriptEditor | component exists and is a function | ? PASS | ~1ms |
| ManuscriptEditor | accepts required props | ? PASS | ~1ms |
| ManuscriptEditor | handles empty chunk window | ? PASS | ~1ms |
| ExportSheet | component exists and is a function | ? PASS | ~1ms |
| ExportSheet | accepts required props | ? PASS | ~1ms |
| ExportSheet | handles null book | ? PASS | ~1ms |
| BookCardSkeleton | component exists and is a function | ? PASS | ~1ms |
| BookCardSkeleton | accepts count prop | ? PASS | ~1ms |
| BookCardSkeleton | has default count of 4 | ? PASS | ~1ms |

**Summary: 42 tests, 42 passed, 0 failed**
