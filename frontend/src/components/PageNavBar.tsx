/**
 * PageNavBar — reusable previous/next page navigation bar.
 *
 * Drop into any screen that uses usePagination. Pass the values returned
 * by the hook directly; this component owns no state.
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";

export interface PageNavBarProps {
  /** 0-based index of the currently displayed page. */
  currentPage: number;
  /** Total number of pages. */
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  /** Background color of the bar (default: theme.bg). */
  backgroundColor?: string;
  /** Color of the page indicator text and disabled arrows. */
  textColor?: string;
  /** Color of enabled arrow icons. */
  activeColor?: string;
  /** Border color of the top separator. */
  borderColor?: string;
  /**
   * Prefix for all testIDs in this bar. When empty (default) the testIDs are:
   *   page-prev, page-indicator, page-next
   * With prefix "modal-" they become:
   *   modal-page-prev, modal-page-indicator, modal-page-next
   */
  testIDPrefix?: string;
}

export default function PageNavBar({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  backgroundColor = theme.bg,
  textColor = theme.textSecondary,
  activeColor = theme.textPrimary,
  borderColor = theme.border,
  testIDPrefix = "",
}: PageNavBarProps) {
  const atFirst = currentPage === 0;
  const atLast = currentPage === totalPages - 1;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, borderTopColor: borderColor },
      ]}
    >
      <TouchableOpacity
        testID={`${testIDPrefix}page-prev`}
        onPress={onPrev}
        disabled={atFirst}
        style={styles.btn}
        accessibilityLabel="Previous page"
        accessibilityRole="button"
      >
        <Ionicons
          name="chevron-back"
          size={24}
          color={atFirst ? textColor : activeColor}
        />
      </TouchableOpacity>

      <Text
        testID={`${testIDPrefix}page-indicator`}
        style={[styles.label, { color: textColor }]}
      >
        {`Page ${currentPage + 1} of ${totalPages}`}
      </Text>

      <TouchableOpacity
        testID={`${testIDPrefix}page-next`}
        onPress={onNext}
        disabled={atLast}
        style={styles.btn}
        accessibilityLabel="Next page"
        accessibilityRole="button"
      >
        <Ionicons
          name="chevron-forward"
          size={24}
          color={atLast ? textColor : activeColor}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  btn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
});
