/**
 * SearchOverlay — Full-text search within a book
 *
 * Slide-down overlay with search input, result count,
 * and prev/next navigation. Highlights matching paragraphs.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { theme } from "../../lib/theme";

export interface SearchMatch {
  paraIndex: number;
  text: string;            // the paragraph text
  matchStart: number;      // char offset within paragraph
  matchLength: number;
}

interface Props {
  visible: boolean;
  paragraphs: string[];
  onNavigate: (paraIndex: number) => void;
  onHighlightChange: (matches: SearchMatch[], activeIndex: number) => void;
  onClose: () => void;
}

export default function SearchOverlay({
  visible,
  paragraphs,
  onNavigate,
  onHighlightChange,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Compute matches
  const matches = useMemo<SearchMatch[]>(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const results: SearchMatch[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const lower = paragraphs[i].toLowerCase();
      let pos = 0;
      while (true) {
        const idx = lower.indexOf(q, pos);
        if (idx === -1) break;
        results.push({
          paraIndex: i,
          text: paragraphs[i],
          matchStart: idx,
          matchLength: query.length,
        });
        pos = idx + 1;
      }
    }
    return results;
  }, [query, paragraphs]);

  // Reset active match when query changes
  useEffect(() => {
    setActiveMatch(0);
  }, [query]);

  // Notify parent of highlight changes
  useEffect(() => {
    onHighlightChange(matches, activeMatch);
  }, [matches, activeMatch]);

  // Navigate to active match
  useEffect(() => {
    if (matches.length > 0 && matches[activeMatch]) {
      onNavigate(matches[activeMatch].paraIndex);
    }
  }, [activeMatch, matches]);

  // Auto-focus input when visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setActiveMatch(0);
      onHighlightChange([], 0);
    }
  }, [visible]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatch((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatch((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withTiming(visible ? 0 : -120, {
          duration: 250,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      },
    ],
    opacity: withTiming(visible ? 1 : 0, { duration: 200 }),
    pointerEvents: visible ? ("auto" as const) : ("none" as const),
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <Ionicons
            name="search"
            size={18}
            color={theme.textTertiary}
            style={{ marginLeft: 12 }}
          />
          <TextInput
            ref={inputRef}
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search in book…"
            placeholderTextColor={theme.textTertiary}
            style={styles.input}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              style={styles.clearBtn}
            >
              <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          testID="search-close"
          onPress={handleClose}
          style={styles.closeBtn}
        >
          <Text style={styles.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {query.length >= 2 && (
        <View style={styles.resultsRow}>
          <Text style={styles.resultCount}>
            {matches.length === 0
              ? "No results"
              : `${activeMatch + 1} of ${matches.length}`}
          </Text>
          <View style={styles.navBtns}>
            <TouchableOpacity
              testID="search-prev"
              onPress={goPrev}
              disabled={matches.length === 0}
              style={[styles.navBtn, matches.length === 0 && styles.navBtnDisabled]}
            >
              <Ionicons
                name="chevron-up"
                size={20}
                color={matches.length === 0 ? theme.textTertiary : theme.textPrimary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              testID="search-next"
              onPress={goNext}
              disabled={matches.length === 0}
              style={[styles.navBtn, matches.length === 0 && styles.navBtnDisabled]}
            >
              <Ionicons
                name="chevron-down"
                size={20}
                color={matches.length === 0 ? theme.textTertiary : theme.textPrimary}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingTop: Platform.OS === "ios" ? 50 : 36,
    paddingHorizontal: 12,
    paddingBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surfaceHi,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    height: 42,
  },
  input: {
    flex: 1,
    color: theme.textPrimary,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: 42,
  },
  clearBtn: {
    paddingHorizontal: 10,
    height: 42,
    justifyContent: "center",
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  closeBtnText: {
    color: theme.brand,
    fontSize: 15,
    fontWeight: "600",
  },
  resultsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  resultCount: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  navBtns: {
    flexDirection: "row",
    gap: 4,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
});
