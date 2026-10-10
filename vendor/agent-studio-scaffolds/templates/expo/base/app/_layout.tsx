import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

// Every file in app/ is a screen: app/index.tsx is "/", app/chat.tsx is "/chat", and so on.
export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ title: "Superteam Agent App" }} />
    </>
  );
}
