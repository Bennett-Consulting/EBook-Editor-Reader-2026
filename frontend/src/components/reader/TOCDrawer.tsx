/**
 * TOC Drawer — Left slide-in Table of Contents
 *
 * Extracts chapters from content headings and lets the user
 * tap to jump to any section. Current chapter is highlighted.
 * Design: TomeMaster-inspired collapsible sidebar.
 */

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { theme } from "../../lib/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const DRAWER_W = Math.min(320, SCREEN_W * 0.8);

export interface TOCEntry {
  index: number;      // paragraph index in content
  title: string;      // chapter/heading text
  level: number;      // heading depth (1=H1, 2=H2, 3=H3)
}

interface Props {
  visible: boolean;
  entries: TOCEntry[];
  currentIndex: number;
  bookTitle: string;
  bookAuthor: string;
  progress: number;          // 0..1
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * Extract TOC entries from raw paragraphs.
 * Recognises markdown headings (# / ## / ###) and "Chapter ..." lines.
 */
export function extractTOC(paragraphs: string[]): TOCEntry[] {
  const entries: TOCEntry[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // Markdown heading
    const mdMatch = p.match(/^(#{1,3})\s+(.+)/);
    if (mdMatch) {
      entries.push({
        index: i,
        title: mdMatch[2].trim(),
        level: mdMatch[1].length,
      });
      continue;
    }
    // "Chapter N" or "Chapter N — Title"
    const chapMatch = p.match(/^chapter\s+\d+/i);
    if (chapMatch) {
      entries.push({
        index: i,
        title: p.replace(/^#{1,3}\s*/, "").trim(),
        level: 1,
      });
    }
  }
  return entries;
}

export default function TOCDrawer({
  visible,
  entries,
  currentIndex,
  bookTitle,
  bookAuthor,
  progress,
  onSelect,
  onClose,
}: Props) {
  // Find which TOC entry we're currently in
  const activeEntry = useMemo(() => {
    let active = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].index <= currentIndex) {
        active = i;
        break;
      }
    }
    return active;
  }, [entries, currentIndex]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 250 }),
    pointerEvents: visible ? ("auto" as const) : ("none" as const),
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(visible ? 0 : -DRAWER_W, {
          duration: 300,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, drawerStyle]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.bookTitle}>
              {bookTitle}
            </Text>
            <Text numberOfLines={1} style={styles.bookAuthor}>
              {bookAuthor}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(2, Math.round(progress * 100))}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}%
          </Text>
        </View>

        {/* TOC List */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {entries.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="list-outline"
                size={32}
                color={theme.textTertiary}
              />
              <Text style={styles.emptyText}>
                No chapters detected.{"\n"}
                Use markdown headings (# Chapter 1) to create a table of
                contents.
              </Text>
            </View>
          ) : (
            entries.map((entry, i) => {
              const isActive = i === activeEntry;
              return (
                <TouchableOpacity
                  key={`${entry.index}-${i}`}
                  testID={`toc-entry-${i}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelect(entry.index);
                    onClose();
                  }}
                  style={[
                    styles.tocItem,
                    isActive && styles.tocItemActive,
                    { paddingLeft: 16 + (entry.level - 1) * 16 },
                  ]}
                >
                  {isActive && <View style={styles.activeDot} />}
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.tocText,
                      isActive && styles.tocTextActive,
                      entry.level > 1 && styles.tocTextSub,
                    ]}
                  >
                    {entry.title}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="location"
                      size={14}
                      color={theme.brand}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons name="book-outline" size={14} color={theme.textTertiary} />
          <Text style={styles.footerText}>
            {entries.length} chapter{entries.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_W,
    backgroundColor: theme.surface,
    borderRightWidth: 1,
    borderRightColor: theme.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 42,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  bookTitle: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  bookAuthor: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.brand,
    borderRadius: 2,
  },
  progressText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    minWidth: 34,
    textAlign: "right",
  },

  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyText: {
    color: theme.textTertiary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },

  tocItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
    gap: 10,
  },
  tocItemActive: {
    backgroundColor: "rgba(255,176,0,0.08)",
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.brand,
  },
  tocText: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  tocTextActive: {
    color: theme.brand,
    fontWeight: "700",
  },
  tocTextSub: {
    fontSize: 13,
    color: theme.textSecondary,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  footerText: {
    color: theme.textTertiary,
    fontSize: 12,
  },
});
