/**
 * Reader Screen
 *
 * Integrated new Reader Chrome features with modular sheets and useAnnotations hook:
 *   - useAnnotations          — index-based highlight/note logic (fixes duplicate bug)
 *   - ReaderSettingsSheet     — font size, line height, serif, paper mode
 *   - AnnotationsSheet        — highlights & notes list
 *   - HighlightModal          — add highlight + note
 *   - ReadingProgress         - TOC toggle, bookmarks, progress percentage, reading time
 *   - SearchOverlay           - full text search highlighting
 *   - TOCDrawer               - table of contents navigation drawer
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { theme } from "../../src/lib/theme";
import { Book, ReaderPrefs } from "../../src/lib/types";
import {
  defaultPrefs,
  getBook,
  getPrefs,
  saveBook,
  savePrefs,
} from "../../src/lib/storage";
import { paginate, clampPageIndex } from "../../src/lib/paginationEngine";
import ExportSheet from "../../src/components/ExportSheet";
import TOCDrawer, {
  extractTOC,
} from "../../src/components/reader/TOCDrawer";
import SearchOverlay, {
  SearchMatch,
} from "../../src/components/reader/SearchOverlay";
import ReadingProgress from "../../src/components/reader/ReadingProgress";
import ReaderSettingsSheet from "../../src/components/reader/ReaderSettingsSheet";
import AnnotationsSheet from "../../src/components/reader/AnnotationsSheet";
import HighlightModal from "../../src/components/reader/HighlightModal";
import { useAnnotations } from "../../src/hooks/reader/useAnnotations";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>(defaultPrefs);

  // Chrome visibility (auto-hide)
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drawer / overlay state
  const [showTOC, setShowTOC] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnnotationsList, setShowAnnotationsList] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Highlight modal
  const [highlightTarget, setHighlightTarget] = useState<{
    visible: boolean;
    paraIndex: number;
    paraText: string;
  }>({ visible: false, paraIndex: -1, paraText: "" });

  // Search state
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(0);

  // Current scroll position tracking
  const [currentParagraph, setCurrentParagraph] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(1);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paraOffsetsRef = useRef<number[]>([]);

  // Pagination state — null means short book (scroll mode)
  const [pages, setPages] = useState<string[] | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // ── Load book & prefs ────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const [b, p] = await Promise.all([getBook(String(id)), getPrefs()]);
      setBook(b);
      setPrefs(p);
      if (b && b.content.length > 50_000) {
        // Long book — paginate and restore saved page index
        const pg = paginate(b.content, SCREEN_W, SCREEN_H - 120);
        setPages(pg);
        setCurrentPage(clampPageIndex(b.scrollY ?? 0, pg.length));
      } else {
        // Short book — restore scroll position as before
        setTimeout(() => {
          if (b?.scrollY && scrollRef.current) {
            scrollRef.current.scrollTo({ y: b.scrollY, animated: false });
          }
        }, 50);
      }
    })();
  }, [id]);

  // ── Paragraphs & TOC ────────────────────────────────────────────────────

  const paragraphs = useMemo(() => {
    if (!book) return [];
    return book.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [book]);

  const tocEntries = useMemo(() => extractTOC(paragraphs), [paragraphs]);

  const totalWords = useMemo(() => {
    if (!book) return 0;
    return book.content.split(/\s+/).filter(Boolean).length;
  }, [book]);

  // Paragraphs visible on the current page (full list for short books)
  const currentPageParagraphs = useMemo(() => {
    if (!pages) return paragraphs;
    const text = pages[currentPage] ?? "";
    return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }, [pages, currentPage, paragraphs]);

  // ── Annotations hook (index-based, fixes duplicate bug) ───────────────

  const annotations = useAnnotations(book, setBook, paragraphs);

  // ── Chrome auto-hide ─────────────────────────────────────────────────────

  const resetChromeTimer = useCallback(() => {
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => {
      if (!showTOC && !showSearch && !showSettings && !showAnnotationsList && !showExport) {
        setChromeVisible(false);
      }
    }, 5000);
  }, [showTOC, showSearch, showSettings, showAnnotationsList, showExport]);

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => {
      const next = !prev;
      if (next) resetChromeTimer();
      return next;
    });
  }, [resetChromeTimer]);

  // Advance to a specific page, save index to Book.scrollY
  const goToPage = useCallback(
    (idx: number) => {
      if (!pages || idx < 0 || idx >= pages.length || !book) return;
      setCurrentPage(idx);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const progress = (idx + 1) / pages.length;
      const updated = { ...book, scrollY: idx, progress };
      saveBook(updated);
      setBook(updated);
    },
    [pages, book]
  );

  // Show chrome when any overlay opens
  useEffect(() => {
    if (showTOC || showSearch || showSettings || showAnnotationsList || showExport) {
      setChromeVisible(true);
    }
  }, [showTOC, showSearch, showSettings, showAnnotationsList, showExport]);

  // ── Scroll tracking ──────────────────────────────────────────────────────

  if (!book) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ color: theme.textSecondary, padding: 24 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const paperMode = prefs.paperMode;
  const bg = paperMode ? theme.paperBg : theme.bg;
  const txt = paperMode ? theme.paperText : theme.reading;
  const sub = paperMode ? "#5a554b" : theme.textSecondary;

  const persistScroll = (y: number) => {
    if (pages) return; // paginated mode — goToPage handles saves
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      contentHeightRef.current = contentHeightRef.current || 1;
      const total = Math.max(1, contentHeightRef.current - layoutHeightRef.current);
      const progress = Math.min(1, Math.max(0, y / total));
      saveBook({ ...book, scrollY: y, progress });
      setBook((prev) => (prev ? { ...prev, scrollY: y, progress } : prev));

      const offsets = paraOffsetsRef.current;
      if (offsets.length > 0) {
        let idx = 0;
        for (let i = offsets.length - 1; i >= 0; i--) {
          if (offsets[i] <= y + 100) {
            idx = i;
            break;
          }
        }
        setCurrentParagraph(idx);
      }
    }, 500);
  };

  const updatePrefs = async (next: ReaderPrefs) => {
    setPrefs(next);
    await savePrefs(next);
  };

  // ── Scroll to paragraph ──────────────────────────────────────────────────

  const scrollToParagraph = useCallback((index: number) => {
    const offsets = paraOffsetsRef.current;
    if (offsets[index] !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: offsets[index] - 80, animated: true });
    }
  }, []);

  // ── Search handlers ──────────────────────────────────────────────────────

  const handleSearchHighlight = useCallback(
    (matches: SearchMatch[], activeIndex: number) => {
      setSearchMatches(matches);
      setActiveSearchIdx(activeIndex);
    },
    []
  );

  const handleSearchNavigate = useCallback(
    (paraIndex: number) => scrollToParagraph(paraIndex),
    [scrollToParagraph]
  );

  // ── Highlight actions ────────────────────────────────────────────────────

  const openHighlightModal = (paraIndex: number, paraText: string) => {
    setHighlightTarget({ visible: true, paraIndex, paraText });
  };

  const handleHighlightSave = async (note: string) => {
    await annotations.addAnnotation(highlightTarget.paraIndex, highlightTarget.paraText, note);
    setHighlightTarget({ visible: false, paraIndex: -1, paraText: "" });
  };

  // ── Bookmark ─────────────────────────────────────────────────────────────

  const isCurrentBookmarked = useMemo(() => {
    if (paragraphs.length === 0) return false;
    const currentText = paragraphs[currentParagraph];
    return currentText ? annotations.isHighlighted(currentParagraph, currentText) : false;
  }, [currentParagraph, paragraphs, book?.annotations, annotations]);

  const handleQuickBookmark = useCallback(async () => {
    await annotations.toggleBookmark(currentParagraph);
  }, [currentParagraph, annotations]);

  // ── Search highlight helper ──────────────────────────────────────────────

  const getSearchHighlight = (paraIndex: number) => {
    if (searchMatches.length === 0) return null;
    const match = searchMatches.find((m) => m.paraIndex === paraIndex);
    if (!match) return null;
    const isActive = searchMatches[activeSearchIdx]?.paraIndex === paraIndex;
    return { match, isActive };
  };

  // ── Animated toolbar ─────────────────────────────────────────────────────

  const toolbarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withTiming(chromeVisible ? 0 : -80, {
          duration: 250,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      },
    ],
    opacity: withTiming(chromeVisible ? 1 : 0, { duration: 200 }),
  }));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={["top"]}>
      {/* ─── Toolbar ─── */}
      <Animated.View
        style={[
          styles.toolbar,
          { borderBottomColor: paperMode ? "#0001" : theme.border },
          toolbarStyle,
        ]}
      >
        <TouchableOpacity testID="reader-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity testID="reader-toc-toggle" onPress={() => setShowTOC(true)} style={styles.iconBtn}>
          <Ionicons name="list" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 4 }}>
          <Text numberOfLines={1} style={[styles.tbTitle, { color: paperMode ? "#222" : theme.textPrimary }]}>
            {book.title}
          </Text>
          <Text numberOfLines={1} style={[styles.tbAuthor, { color: sub }]}>
            {book.author} · {Math.round((book.progress || 0) * 100)}%
          </Text>
        </View>
        <TouchableOpacity testID="reader-search" onPress={() => setShowSearch(true)} style={styles.iconBtn}>
          <Ionicons name="search" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity testID="reader-edit" onPress={() => router.push(`/editor/${book.id}`)} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity testID="reader-export" onPress={() => setShowExport(true)} style={styles.iconBtn}>
          <Ionicons name="share-outline" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity testID="reader-annotations" onPress={() => setShowAnnotationsList(true)} style={styles.iconBtn}>
          <Ionicons name="bookmark-outline" size={20} color={paperMode ? "#222" : theme.textPrimary} />
          {book.annotations.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{book.annotations.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity testID="reader-settings" onPress={() => setShowSettings(true)} style={styles.iconBtn}>
          <Ionicons name="text" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Content ─── */}
      <Pressable style={{ flex: 1 }} onPress={toggleChrome}>
        <ScrollView
          ref={scrollRef}
          testID="reader-scroll"
          style={{ flex: 1, backgroundColor: bg }}
          contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 160 }}
          onScroll={(e) => persistScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={200}
          onContentSizeChange={(_w, h) => (contentHeightRef.current = h)}
          onLayout={(e) => (layoutHeightRef.current = e.nativeEvent.layout.height)}
        >
          {(!pages || currentPage === 0) && (
            <>
              <Text
                style={[
                  styles.bookTitle,
                  {
                    color: paperMode ? "#1a1a1a" : theme.textPrimary,
                    fontFamily: prefs.serif
                      ? Platform.select({ ios: "Georgia", default: "serif" })
                      : undefined,
                  },
                ]}
              >
                {book.title}
              </Text>
              <Text style={[styles.bookAuthor, { color: sub }]}>{book.author}</Text>
            </>
          )}

          {currentPageParagraphs.map((p, i) => {
            const highlighted = annotations.isHighlighted(i, p);
            const ann = annotations.annotationFor(i, p);
            const isHeading = /^#{1,3}\s/.test(p) || /^chapter\s/i.test(p);
            const searchHL = getSearchHighlight(i);

            return (
              <Pressable
                key={i}
                testID={`para-${i}`}
                onLongPress={() => openHighlightModal(i, p)}
                delayLongPress={300}
                onLayout={(e) => {
                  paraOffsetsRef.current[i] = e.nativeEvent.layout.y;
                }}
              >
                {isHeading ? (
                  <Text
                    style={[
                      styles.heading,
                      {
                        color: paperMode ? "#1a1a1a" : theme.textPrimary,
                        fontFamily: prefs.serif
                          ? Platform.select({ ios: "Georgia", default: "serif" })
                          : undefined,
                      },
                    ]}
                  >
                    {p.replace(/^#{1,3}\s/, "")}
                  </Text>
                ) : (
                  <Text
                    style={[
                      {
                        color: txt,
                        fontSize: prefs.fontSize,
                        lineHeight: prefs.fontSize * prefs.lineHeight,
                        marginBottom: 18,
                        fontFamily: prefs.serif
                          ? Platform.select({ ios: "Georgia", default: "serif" })
                          : undefined,
                        backgroundColor: searchHL
                          ? searchHL.isActive
                            ? "rgba(255,176,0,0.4)"
                            : "rgba(255,176,0,0.15)"
                          : highlighted
                            ? theme.highlight
                            : "transparent",
                        paddingHorizontal: highlighted || searchHL ? 4 : 0,
                        borderRadius: highlighted || searchHL ? 4 : 0,
                      },
                    ]}
                  >
                    {p}
                  </Text>
                )}
                {ann?.note ? (
                  <View
                    style={[
                      styles.noteBox,
                      { backgroundColor: paperMode ? "#0000000d" : theme.surface },
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.brand} />
                    <Text
                      style={[
                        styles.noteText,
                        { color: paperMode ? "#3a3a3a" : theme.textSecondary },
                      ]}
                    >
                      {ann.note}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Pressable>

      {/* ─── Page Navigation (long books only) ─── */}
      {pages && (
        <View style={[styles.pageNav, { backgroundColor: bg, borderTopColor: paperMode ? "#0001" : theme.border }]}>
          <TouchableOpacity
            testID="page-prev"
            onPress={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            style={styles.pageNavBtn}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={currentPage === 0 ? sub : (paperMode ? "#222" : theme.textPrimary)}
            />
          </TouchableOpacity>
          <Text testID="page-indicator" style={[styles.pageIndicatorText, { color: sub }]}>
            {`Page ${currentPage + 1} of ${pages.length}`}
          </Text>
          <TouchableOpacity
            testID="page-next"
            onPress={() => goToPage(currentPage + 1)}
            disabled={currentPage === pages.length - 1}
            style={styles.pageNavBtn}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={currentPage === pages.length - 1 ? sub : (paperMode ? "#222" : theme.textPrimary)}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Reading Progress Bar ─── */}
      <ReadingProgress
        visible={chromeVisible}
        progress={book.progress || 0}
        currentParagraph={currentParagraph}
        totalParagraphs={paragraphs.length}
        tocEntries={tocEntries}
        totalWords={totalWords}
        paperMode={paperMode}
        isBookmarked={isCurrentBookmarked}
        onBookmark={handleQuickBookmark}
        onTOCOpen={() => setShowTOC(true)}
      />

      {/* ─── Search Overlay ─── */}
      <SearchOverlay
        visible={showSearch}
        paragraphs={paragraphs}
        onNavigate={handleSearchNavigate}
        onHighlightChange={handleSearchHighlight}
        onClose={() => setShowSearch(false)}
      />

      {/* ─── TOC Drawer ─── */}
      <TOCDrawer
        visible={showTOC}
        entries={tocEntries}
        currentIndex={currentParagraph}
        bookTitle={book.title}
        bookAuthor={book.author}
        progress={book.progress || 0}
        onSelect={scrollToParagraph}
        onClose={() => setShowTOC(false)}
      />

      {/* ─── Settings Sheet (extracted) ─── */}
      <ReaderSettingsSheet
        visible={showSettings}
        prefs={prefs}
        onUpdatePrefs={updatePrefs}
        onClose={() => setShowSettings(false)}
      />

      {/* ─── Annotations List (extracted) ─── */}
      <AnnotationsSheet
        visible={showAnnotationsList}
        annotations={book.annotations}
        onRemove={(id) => annotations.removeAnnotation(id)}
        onClose={() => setShowAnnotationsList(false)}
      />

      {/* ─── Highlight Modal (extracted) ─── */}
      <HighlightModal
        visible={highlightTarget.visible}
        paraText={highlightTarget.paraText}
        onSave={handleHighlightSave}
        onClose={() => setHighlightTarget({ visible: false, paraIndex: -1, paraText: "" })}
      />

      <ExportSheet visible={showExport} book={book} onClose={() => setShowExport(false)} />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  toolbar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    zIndex: 50,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  tbTitle: { fontSize: 14, fontWeight: "600" },
  tbAuthor: { fontSize: 11, marginTop: 1 },
  badge: {
    position: "absolute",
    top: 3,
    right: 4,
    backgroundColor: theme.brand,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#0A0A0B", fontSize: 10, fontWeight: "700" },

  bookTitle: { fontSize: 30, fontWeight: "600", marginBottom: 4, letterSpacing: -0.5 },
  bookAuthor: { fontSize: 13, marginBottom: 28 },

  heading: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 14,
    letterSpacing: -0.3,
  },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginTop: -8,
    marginBottom: 18,
  },
  noteText: { fontSize: 13, flex: 1, lineHeight: 18 },

  pageNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  pageNavBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pageIndicatorText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
