/**
 * BookCardSkeleton — Animated loading placeholder for book grid
 *
 * Shimmer effect on dark surface, matches the book card layout.
 */

import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { theme } from "../lib/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 56) / 2;

function ShimmerBlock({
  width,
  height,
  borderRadius = 8,
  delay = 0,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  delay?: number;
}) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: theme.surfaceHi,
        },
        style,
      ]}
    />
  );
}

export default function BookCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <ShimmerBlock width="100%" height={CARD_W * 0.7} borderRadius={12} delay={i * 100} />
          <View style={{ gap: 6, marginTop: 10 }}>
            <ShimmerBlock width="75%" height={14} borderRadius={4} delay={i * 100 + 50} />
            <ShimmerBlock width="50%" height={11} borderRadius={4} delay={i * 100 + 100} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    width: CARD_W,
  },
});
