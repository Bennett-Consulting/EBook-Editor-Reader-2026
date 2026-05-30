/**
 * Reader Screen — PR #6: Full Reader Chrome
 *
 * Features:
 *   - Auto-hiding toolbar & bottom bar (tap center to toggle)
 *   - TOC drawer (left slide-in, chapter navigation)
 *   - Full-text search overlay with prev/next navigation
 *   - Reading progress bar with chapter info & time remaining
 *   - Quick bookmark from bottom bar
 *   - Enhanced toolbar with search, TOC toggle, bookmark count
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
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
import { Annotation, Book, ReaderPrefs } from "../../src/lib/types";
import {
  defaultPrefs,
  getBook,
  getPrefs,
  saveBook,
  savePrefs,
} from "../../src/lib/storage";
import { exportBook } from "../../src/lib/exporter";
import ExportSheet from "../../src/components/ExportSheet";
import TOCDrawer, {
  extractTOC,
  TOCEntry,
} from "../../src/components/reader/TOCDrawer";
import SearchOverlay, {
  SearchMatch,
} from "../../src/components/reader/SearchOverlay";
import ReadingProgress from "../../src/components/reader/ReadingProgress";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const { height: SCREEN_H } = Dimensions.get("window");

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
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Highlight / note modal
  const [highlightModal, setHighlightModal] = useState<{
    visible: boolean;
    paraIndex: number;
    paraText: string;
  }>({ visible: false, paraIndex: -1, paraText: "" });
  const [noteText, setNoteText] = useState("");

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

  // ── Load book & prefs ────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const [b, p] = await Promise.all([getBook(String(id)), getPrefs()]);
      setBook(b);
      setPrefs(p);
      setTimeout(() => {
        if (b?.scrollY && scrollRef.current) {
          scrollRef.current.scrollTo({ y: b.scrollY, animated: false });
        }
      }, 50);
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

  // ── Chrome auto-hide ─────────────────────────────────────────────────────

  const resetChromeTimer = useCallback(() => {
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => {
      // Only auto-hide if no drawers/modals are open
      if (!showTOC && !showSearch && !showSettings && !showAnnotations && !showExport) {
        setChromeVisible(false);
      }
    }, 5000);
  }, [showTOC, showSearch, showSettings, showAnnotations, showExport]);

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => {
      const next = !prev;
      if (next) resetChromeTimer();
      return next;
    });
  }, [resetChromeTimer]);

  // Show chrome when any overlay opens
  useEffect(() => {
    if (showTOC || showSearch || showSettings || showAnnotations || showExport) {
      setChromeVisible(true);
    }
  }, [showTOC, showSearch, showSettings, showAnnotations, showExport]);

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
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      contentHeightRef.current = contentHeightRef.current || 1;
      const total = Math.max(1, contentHeightRef.current - layoutHeightRef.current);
      const progress = Math.min(1, Math.max(0, y / total));
      saveBook({ ...book, scrollY: y, progress });
      setBook((prev) => prev ? { ...prev, scrollY: y, progress } : prev);

      // Estimate current paragraph from scroll position
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

  const scrollToParagraph = useCallback(
    (index: number) => {
      const offsets = paraOffsetsRef.current;
      if (offsets[index] !== undefined && scrollRef.current) {
        scrollRef.current.scrollTo({ y: offsets[index] - 80, animated: true });
      }
    },
    []
  );

  // ── Search handlers ──────────────────────────────────────────────────────

  const handleSearchHighlight = useCallback(
    (matches: SearchMatch[], activeIndex: number) => {
      setSearchMatches(matches);
      setActiveSearchIdx(activeIndex);
    },
    []
  );

  const handleSearchNavigate = useCallback(
    (paraIndex: number) => {
      scrollToParagraph(paraIndex);
    },
    [scrollToParagraph]
  );

  // ── Highlight / annotations ──────────────────────────────────────────────

  const openHighlightModal = (paraIndex: number, paraText: string) => {
    setNoteText("");
    setHighlightModal({ visible: true, paraIndex, paraText });
  };

  const addAnnotation = async (withNote: boolean) => {
    const { paraIndex, paraText } = highlightModal;
    if (paraIndex < 0) return;
    const start = book.content.indexOf(paraText);
    const end = start + paraText.length;
    const ann: Annotation = {
      id: makeId(),
      text: paraText,
      note: withNote ? noteText.trim() || undefined : undefined,
      start: start >= 0 ? start : 0,
      end: start >= 0 ? end : paraText.length,
      color: theme.brand,
      createdAt: new Date().toISOString(),
    };
    const next = { ...book, annotations: [...book.annotations, ann] };
    setBook(next);
    await saveBook(next);
    setHighlightModal({ visible: false, paraIndex: -1, paraText: "" });
  };

  const removeAnnotation = async (annId: string) => {
    const next = { ...book, annotations: book.annotations.filter((a) => a.id !== annId) };
    setBook(next);
    await saveBook(next);
  };

  const isHighlighted = (paraText: string) =>
    book.annotations.some((a) => a.text === paraText);

  const annotationFor = (paraText: string) =>
    book.annotations.find((a) => a.text === paraText);

  // Check if current paragraph is bookmarked
  const isCurrentBookmarked = useMemo(() => {
    if (paragraphs.length === 0) return false;
    const currentText = paragraphs[currentParagraph];
    return currentText ? isHighlighted(currentText) : false;
  }, [currentParagraph, paragraphs, book?.annotations]);

  const handleQuickBookmark = useCallback(async () => {
    if (paragraphs.length === 0) return;
    const paraText = paragraphs[currentParagraph];
    if (!paraText) return;

    const existing = annotationFor(paraText);
    if (existing) {
      // Remove bookmark
      await removeAnnotation(existing.id);
    } else {
      // Add bookmark
      const start = book.content.indexOf(paraText);
      const end = start + paraText.length;
      const ann: Annotation = {
        id: makeId(),
        text: paraText,
        note: "📌 Bookmark",
        start: start >= 0 ? start : 0,
        end: start >= 0 ? end : paraText.length,
        color: theme.brand,
        createdAt: new Date().toISOString(),
      };
      const next = { ...book, annotations: [...book.annotations, ann] };
      setBook(next);
      await saveBook(next);
    }
  }, [currentParagraph, paragraphs, book]);

  // ── Check if paragraph has search match ──────────────────────────────────

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
        <TouchableOpacity
          testID="reader-back"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="reader-toc-toggle"
          onPress={() => setShowTOC(true)}
          style={styles.iconBtn}
        >
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

        <TouchableOpacity
          testID="reader-search"
          onPress={() => setShowSearch(true)}
          style={styles.iconBtn}
        >
          <Ionicons name="search" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="reader-edit"
          onPress={() => router.push(`/editor/${book.id}`)}
          style={styles.iconBtn}
        >
          <Ionicons name="create-outline" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="reader-export"
          onPress={() => setShowExport(true)}
          style={styles.iconBtn}
        >
          <Ionicons name="share-outline" size={20} color={paperMode ? "#222" : theme.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="reader-annotations"
          onPress={() => setShowAnnotations(true)}
          style={styles.iconBtn}
        >
          <Ionicons name="bookmark-outline" size={20} color={paperMode ? "#222" : theme.textPrimary} />
          {book.annotations.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{book.annotations.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          testID="reader-settings"
          onPress={() => setShowSettings(true)}
          style={styles.iconBtn}
        >
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

          {paragraphs.map((p, i) => {
            const highlighted = isHighlighted(p);
            const ann = annotationFor(p);
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

      {/* ─── Settings Sheet ─── */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowSettings(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Reading</Text>
            <SheetCounter
              label="Font size"
              value={`${prefs.fontSize}px`}
              onMinus={() => updatePrefs({ ...prefs, fontSize: Math.max(14, prefs.fontSize - 1) })}
              onPlus={() => updatePrefs({ ...prefs, fontSize: Math.min(28, prefs.fontSize + 1) })}
            />
            <SheetCounter
              label="Line height"
              value={prefs.lineHeight.toFixed(1)}
              onMinus={() =>
                updatePrefs({
                  ...prefs,
                  lineHeight: Math.max(1.4, +(prefs.lineHeight - 0.1).toFixed(1)),
                })
              }
              onPlus={() =>
                updatePrefs({
                  ...prefs,
                  lineHeight: Math.min(2.2, +(prefs.lineHeight + 0.1).toFixed(1)),
                })
              }
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <ToggleChip
                active={prefs.serif}
                label="Serif"
                onPress={() => updatePrefs({ ...prefs, serif: !prefs.serif })}
              />
              <ToggleChip
                active={prefs.paperMode}
                label="Paper mode"
                onPress={() => updatePrefs({ ...prefs, paperMode: !prefs.paperMode })}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Annotations List ─── */}
      <Modal
        visible={showAnnotations}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAnnotations(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowAnnotations(false)}>
          <Pressable style={[styles.sheet, { maxHeight: "75%" }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Highlights & notes</Text>
            <ScrollView style={{ maxHeight: 460 }}>
              {book.annotations.length === 0 ? (
                <Text style={{ color: theme.textSecondary, paddingVertical: 12 }}>
                  Long-press any paragraph in the reader to highlight it.
                </Text>
              ) : (
                book.annotations.map((a) => (
                  <View key={a.id} style={styles.annItem}>
                    <View style={styles.annBar} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={3} style={styles.annText}>
                        {a.text}
                      </Text>
                      {a.note ? <Text style={styles.annNote}>{a.note}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => removeAnnotation(a.id)}>
                      <Ionicons name="close" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Highlight + Note Modal ─── */}
      <Modal
        visible={highlightModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setHighlightModal({ visible: false, paraIndex: -1, paraText: "" })
        }
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Highlight passage</Text>
            <Text numberOfLines={4} style={styles.previewQuote}>
              "{highlightModal.paraText}"
            </Text>
            <TextInput
              testID="note-input"
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Optional note…"
              placeholderTextColor={theme.textTertiary}
              style={styles.noteInput}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                testID="cancel-highlight"
                onPress={() =>
                  setHighlightModal({ visible: false, paraIndex: -1, paraText: "" })
                }
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-highlight"
                onPress={() => addAnnotation(true)}
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
              >
                <Text style={styles.btnPrimaryText}>Save highlight</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ExportSheet visible={showExport} book={book} onClose={() => setShowExport(false)} />
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SheetCounter({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[styles.row, { paddingVertical: 10 }]}>
      <Text style={{ color: theme.textPrimary, flex: 1 }}>{label}</Text>
      <TouchableOpacity onPress={onMinus} style={styles.counterBtn}>
        <Ionicons name="remove" size={18} color={theme.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.counterValue}>{value}</Text>
      <TouchableOpacity onPress={onPlus} style={styles.counterBtn}>
        <Ionicons name="add" size={18} color={theme.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

function ToggleChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: theme.brand, borderColor: theme.brand },
      ]}
    >
      <Text style={{ color: active ? "#0A0A0B" : theme.textPrimary, fontWeight: "600" }}>
        {label}
      </Text>
    </TouchableOpacity>
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

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: theme.border,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "600", marginBottom: 12 },

  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  counterValue: { color: theme.textPrimary, minWidth: 50, textAlign: "center", fontWeight: "600" },

  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
  },

  annItem: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  annBar: { width: 3, backgroundColor: theme.brand, borderRadius: 2, alignSelf: "stretch" },
  annText: { color: theme.textPrimary, fontSize: 14, lineHeight: 20 },
  annNote: { color: theme.brand, fontSize: 13, marginTop: 6, fontStyle: "italic" },

  previewQuote: {
    color: theme.textSecondary,
    fontStyle: "italic",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: theme.brand,
    paddingLeft: 12,
  },
  noteInput: {
    backgroundColor: theme.surfaceHi,
    color: theme.textPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.brand },
  btnPrimaryText: { color: "#0A0A0B", fontWeight: "700", fontSize: 15 },
  btnGhost: { backgroundColor: theme.surfaceHi, borderWidth: 1, borderColor: theme.border },
  btnGhostText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
});
