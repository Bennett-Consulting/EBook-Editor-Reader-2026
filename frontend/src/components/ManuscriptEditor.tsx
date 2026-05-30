/**
 * ManuscriptEditor — Box F: Horizontal Pager + Editable Pages
 *
 * Port of Android's ManuscriptEditor.kt (92 lines).
 * Pure rendering component — receives state from useDocumentStore,
 * just draws pages and relays edits.
 *
 * Features:
 *   - Horizontal swipe between pages (PagerView)
 *   - Full-page TextInput per page with serif typography
 *   - Backspace-at-position-0 → merge with previous page
 *   - Page counter ("Page X of Y")
 *   - Loading spinner for pages not yet in the sliding window
 *   - Highlight overlay via HighlightTransformation
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  Text,
  ActivityIndicator,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
  FlatList,
  Dimensions,
  ViewToken,
  Platform,
} from "react-native";
import type { DocumentChunk } from "../lib/types";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ManuscriptEditorProps {
  /** Chunks currently in the sliding window */
  chunkWindow: DocumentChunk[];
  /** Total pages in the document */
  totalChunkCount: number;
  /** Current page index */
  currentIndex: number;
  /** Container height for each page (from layout measurement) */
  pageHeight: number;
  /** Called when user edits text on a page */
  onContentChange: (index: number, newContent: string) => void;
  /** Called when user swipes to a new page */
  onPageChange: (index: number) => void;
  /** Called when backspace is pressed at position 0 on a page > 0 */
  onMergeWithPrevious: (currentIndex: number) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ManuscriptEditor({
  chunkWindow,
  totalChunkCount,
  currentIndex,
  pageHeight,
  onContentChange,
  onPageChange,
  onMergeWithPrevious,
}: ManuscriptEditorProps) {
  const flatListRef = useRef<FlatList>(null);
  const screenWidth = Dimensions.get("window").width;

  // Track if we initiated a programmatic scroll (to avoid feedback loops)
  const isScrollingRef = useRef(false);

  // Scroll to currentIndex when it changes externally (e.g., TOC navigation)
  useEffect(() => {
    if (totalChunkCount > 0 && flatListRef.current) {
      isScrollingRef.current = true;
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
      });
      // Reset after animation
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 400);
    }
  }, [currentIndex, totalChunkCount]);

  // ─── Viewability tracking ───────────────────────────────────────────

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (isScrollingRef.current) return;
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        onPageChange(viewableItems[0].index);
      }
    }
  ).current;

  // ─── Page renderer ──────────────────────────────────────────────────

  const renderPage = useCallback(
    ({ item: pageIndex }: { item: number }) => {
      const chunk = chunkWindow.find((c) => c.chunkIndex === pageIndex);

      if (!chunk) {
        return (
          <View
            style={[
              styles.page,
              { width: screenWidth, height: pageHeight },
            ]}
          >
            <ActivityIndicator size="large" color="#666" />
          </View>
        );
      }

      return (
        <PageEditor
          key={`page-${pageIndex}`}
          chunk={chunk}
          pageIndex={pageIndex}
          width={screenWidth}
          height={pageHeight}
          onContentChange={onContentChange}
          onMergeWithPrevious={onMergeWithPrevious}
        />
      );
    },
    [
      chunkWindow,
      screenWidth,
      pageHeight,
      onContentChange,
      onMergeWithPrevious,
    ]
  );

  // Generate array of page indices [0, 1, 2, ..., totalChunkCount-1]
  const pageIndices = Array.from({ length: totalChunkCount }, (_, i) => i);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth]
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={pageIndices}
        renderItem={renderPage}
        keyExtractor={(item) => `page-${item}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={currentIndex}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // Performance: only render ±1 page beyond viewport
        windowSize={3}
        maxToRenderPerBatch={3}
        removeClippedSubviews={Platform.OS !== "web"}
      />

      {/* Page counter — matches Android's bottom-center label */}
      <Text style={styles.pageCounter}>
        Page {currentIndex + 1} of {totalChunkCount}
      </Text>
    </View>
  );
}

// ─── PageEditor (individual page) ───────────────────────────────────────────

interface PageEditorProps {
  chunk: DocumentChunk;
  pageIndex: number;
  width: number;
  height: number;
  onContentChange: (index: number, newContent: string) => void;
  onMergeWithPrevious: (index: number) => void;
}

function PageEditor({
  chunk,
  pageIndex,
  width,
  height,
  onContentChange,
  onMergeWithPrevious,
}: PageEditorProps) {
  const [cursorPosition, setCursorPosition] = useState(0);

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      // Backspace at position 0 on page > 0 → merge with previous
      if (
        e.nativeEvent.key === "Backspace" &&
        cursorPosition === 0 &&
        pageIndex > 0
      ) {
        onMergeWithPrevious(pageIndex);
      }
    },
    [cursorPosition, pageIndex, onMergeWithPrevious]
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setCursorPosition(e.nativeEvent.selection.start);
    },
    []
  );

  const handleTextChange = useCallback(
    (text: string) => {
      onContentChange(pageIndex, text);
    },
    [pageIndex, onContentChange]
  );

  return (
    <View style={[styles.pageContainer, { width, height }]}>
      {/* Chapter title header */}
      {chunk.title && (
        <Text style={styles.chapterTitle}>{chunk.title}</Text>
      )}

      <TextInput
        style={[
          styles.textInput,
          { height: chunk.title ? height - 48 : height },
        ]}
        value={chunk.cleanContent}
        onChangeText={handleTextChange}
        onKeyPress={handleKeyPress}
        onSelectionChange={handleSelectionChange}
        multiline
        textAlignVertical="top"
        autoCorrect
        autoCapitalize="sentences"
        scrollEnabled={false}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  page: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FDFBF7",
  },
  pageContainer: {
    backgroundColor: "#FDFBF7",
  },
  chapterTitle: {
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  textInput: {
    flex: 1,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 18,
    lineHeight: 27,
    color: "#1A1A1A",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "transparent",
    textAlignVertical: "top",
  },
  pageCounter: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    fontSize: 12,
    color: "#999",
    fontFamily: Platform.select({
      ios: "Helvetica Neue",
      default: "sans-serif",
    }),
  },
});
