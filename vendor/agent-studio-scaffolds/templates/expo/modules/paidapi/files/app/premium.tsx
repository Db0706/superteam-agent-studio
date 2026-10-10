import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Button, Card, Muted, Output, Screen } from "../components/Screen";
import { CompanionError } from "../lib/companion";
import { buyPremiumData, getSpending, peekPremiumData, type SpendingSnapshot } from "../lib/paidapi/client";

export default function Premium() {
  const [spending, setSpending] = useState<SpendingSnapshot | null>(null);
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSpending().then(setSpending, (err: unknown) => setError(messageOf(err)));
  }, []);

  async function run(action: () => Promise<unknown>) {
    setLoading(true);
    setError(null);
    try {
      setOutput(await action());
    } catch (err) {
      setError(messageOf(err));
      // A refused purchase still reports the budget.
      const body = err instanceof CompanionError ? (err.body as { spending?: SpendingSnapshot } | null) : null;
      if (body?.spending) setSpending(body.spending);
    } finally {
      setLoading(false);
    }
  }

  // Step 1: call the paid endpoint without paying, to see the 402 and its price.
  const peek = () => run(peekPremiumData);

  // Step 2: ask the companion's agent to pay for it (its devnet key never leaves the server).
  const buy = () =>
    run(async () => {
      const result = await buyPremiumData();
      setSpending(result.spending);
      return result;
    });

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Premium data</Text>
      <Muted>
        Your companion server sells /premium-data for a cent of devnet test USDC per call (no real money). Its agent
        pays with its own wallet, inside its spending limits.
      </Muted>
      {spending && (
        <Card>
          <Text>
            Agent budget: spent ${spending.spentUsd} of ${spending.budgetUsd} · max ${spending.maxPaymentUsd} per payment
          </Text>
        </Card>
      )}
      <Button title="1. Check the price (no payment)" onPress={peek} disabled={loading} />
      <Button title="2. Let the agent pay" onPress={buy} disabled={loading} />
      {error && <Text style={{ color: "#b00020" }}>{error}</Text>}
      {output !== null && <Output value={output} />}
    </Screen>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
