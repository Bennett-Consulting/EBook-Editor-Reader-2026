/**
 * EmptyState — Consistent empty/zero-state display
 *
 * Used across Library, Write, and Annotations views
 * for a polished experience when there's no content yet.
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { theme } from "../lib/theme";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  action?: {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  testID?: string;
}

export default function EmptyState({ icon, title, subtitle, action, testID }: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withDelay(150, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(
      150,
      withTiming(0, { duration: 500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, animStyle]} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={40} color={theme.textTertiary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {action && (
        <TouchableOpacity
          testID={`${testID}-action`}
          onPress={action.onPress}
          style={styles.actionBtn}
          activeOpacity={0.8}
        >
          {action.icon && (
            <Ionicons name={action.icon} size={18} color="#0A0A0B" />
          )}
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
    marginBottom: 24,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.brand,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: theme.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  actionText: {
    color: "#0A0A0B",
    fontSize: 15,
    fontWeight: "700",
  },
});
