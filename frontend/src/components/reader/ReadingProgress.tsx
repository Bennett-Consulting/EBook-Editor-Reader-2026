/**
 * ReadingProgress — Bottom bar with chapter info and progress
 *
 * Shows current chapter, reading progress, and estimated time remaining.
 * Auto-hides with the rest of the chrome.
 */

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { theme } from "../../lib/theme";
import type { TOCEntry } from "./TOCDrawer";

interface Props {
  visible: boolean;
  progress: number;          // 0..1
  currentParagraph: number;
  totalParagraphs: number;
  tocEntries: TOCEntry[];
  totalWords: number;
  paperMode: boolean;
  isBookmarked: boolean;
  onBookmark: () => void;
  onTOCOpen: () => void;
}

const AVG_WPM = 238; // average adult reading speed

export default function ReadingProgress({
  visible,
  progress,
  currentParagraph,
  totalParagraphs,
  tocEntries,
  totalWords,
  paperMode,
  isBookmarked,
  onBookmark,
  onTOCOpen,
}: Props) {
  // Current chapter name
  const currentChapter = useMemo(() => {
    if (tocEntries.length === 0) return null;
    let chapter = tocEntries[0];
    for (let i = tocEntries.length - 1; i >= 0; i--) {
      if (tocEntries[i].index <= currentParagraph) {
        chapter = tocEntries[i];
        break;
      }
    }
    return chapter;
  }, [tocEntries, currentParagraph]);

  // Estimated time remaining
  const timeRemaining = useMemo(() => {
    const wordsLeft = Math.round(totalWords * (1 - progress));
    const minutes = Math.round(wordsLeft / AVG_WPM);
    if (minutes < 1) return "< 1 min left";
    if (minutes < 60) return `${minutes} min left`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`;
  }, [totalWords, progress]);

  const bg = paperMode ? "#E8E4DB" : theme.surface;
  const textColor = paperMode ? "#3a3a3a" : theme.textSecondary;
  const accentColor = paperMode ? "#6B5B3E" : theme.brand;

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withTiming(visible ? 0 : 100, {
          duration: 250,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      },
    ],
    opacity: withTiming(visible ? 1 : 0, { duration: 200 }),
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bg, borderTopColor: paperMode ? "#0001" : theme.border },
        containerStyle,
      ]}
    >
      {/* Full-width progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(1, Math.round(progress * 100))}%`,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>

      <View style={styles.content}>
        {/* Left: Chapter info */}
        <TouchableOpacity
          onPress={onTOCOpen}
          style={styles.chapterBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="list" size={16} color={textColor} />
          <Text numberOfLines={1} style={[styles.chapterText, { color: textColor }]}>
            {currentChapter ? currentChapter.title : "Start"}
          </Text>
        </TouchableOpacity>

        {/* Center: Progress */}
        <View style={styles.center}>
          <Text style={[styles.progressPercent, { color: accentColor }]}>
            {Math.round(progress * 100)}%
          </Text>
          <Text style={[styles.timeText, { color: textColor }]}>
            {timeRemaining}
          </Text>
        </View>

        {/* Right: Bookmark */}
        <TouchableOpacity
          testID="progress-bookmark"
          onPress={onBookmark}
          style={styles.bookmarkBtn}
        >
          <Ionicons
            name={isBookmarked ? "bookmark" : "bookmark-outline"}
            size={20}
            color={isBookmarked ? accentColor : textColor}
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  chapterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chapterText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  center: {
    alignItems: "center",
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: "700",
  },
  timeText: {
    fontSize: 11,
    marginTop: 1,
  },
  bookmarkBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
