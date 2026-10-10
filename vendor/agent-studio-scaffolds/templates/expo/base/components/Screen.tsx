import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// Small shared building blocks so every screen looks the same. Restyle freely.

export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.buttonDim]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

/** Shows any value as pretty-printed JSON. */
export function Output({ value }: { value: unknown }) {
  return <Text style={styles.output}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</Text>;
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  muted: { color: "#666" },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", gap: 6 },
  button: { backgroundColor: "#512da8", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600" },
  output: { fontFamily: "monospace", fontSize: 12, backgroundColor: "#f4f4f4", color: "#222", padding: 10, borderRadius: 8 },
});
