"use client";

import { useSelectedWalletAccount } from "@solana/react";
import { useConnect, useDisconnect, type UiWallet } from "@wallet-standard/react";
import { useState } from "react";

/** Lists the visitor's installed Solana wallets and connects the one they pick. */
export function ConnectWallet() {
  const [account, setAccount, wallets] = useSelectedWalletAccount();
  const [error, setError] = useState<string | null>(null);

  if (account) {
    const wallet = wallets.find((w) => w.accounts.some((a) => a.address === account.address));
    return (
      <p>
        Connected: <code>{account.address.slice(0, 4)}…{account.address.slice(-4)}</code>{" "}
        {wallet ? <DisconnectButton wallet={wallet} onDone={() => setAccount(undefined)} /> : null}
      </p>
    );
  }

  if (!wallets.length) {
    return (
      <p className="muted">
        No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, switch it to devnet, then reload.
      </p>
    );
  }

  return (
    <>
      <p>Connect a wallet:</p>
      {wallets.map((wallet) => (
        <ConnectButton
          key={wallet.name}
          wallet={wallet}
          onConnected={(accounts) => setAccount(accounts[0])}
          onError={(e) => setError(e instanceof Error ? e.message : String(e))}
        />
      ))}
      {error && <p className="muted">Could not connect: {error}</p>}
    </>
  );
}

function ConnectButton({
  wallet,
  onConnected,
  onError,
}: {
  wallet: UiWallet;
  onConnected: (accounts: readonly UiWallet["accounts"][number][]) => void;
  onError: (e: unknown) => void;
}) {
  const [isConnecting, connect] = useConnect(wallet);
  return (
    <button disabled={isConnecting} onClick={() => connect().then(onConnected, onError)}>
      {wallet.icon ? <img src={wallet.icon} alt="" width={16} height={16} /> : null} {wallet.name}
    </button>
  );
}

function DisconnectButton({ wallet, onDone }: { wallet: UiWallet; onDone: () => void }) {
  const [isDisconnecting, disconnect] = useDisconnect(wallet);
  return (
    <button disabled={isDisconnecting} onClick={() => disconnect().finally(onDone)}>
      Disconnect
    </button>
  );
}
