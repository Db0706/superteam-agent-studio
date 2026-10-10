import { useState } from "react";
import { Text, TextInput } from "react-native";
import { Button, Muted, Output, Screen } from "../components/Screen";
import { askGemini } from "../lib/ai/client";

export default function Chat() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setError(null);
    try {
      setAnswer(await askGemini(prompt));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Gemini chat</Text>
      <Muted>Your question goes to your companion server, which asks Gemini with its key.</Muted>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Ask anything…"
        multiline
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, minHeight: 80 }}
      />
      <Button title={loading ? "Thinking…" : "Ask Gemini"} onPress={send} disabled={loading || !prompt.trim()} />
      {error && <Text style={{ color: "#b00020" }}>{error}</Text>}
      {answer && <Output value={answer} />}
    </Screen>
  );
}
