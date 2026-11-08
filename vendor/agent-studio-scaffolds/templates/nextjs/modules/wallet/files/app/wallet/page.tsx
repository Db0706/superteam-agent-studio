"use client";

import { useSelectedWalletAccount } from "@solana/react";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { PayWithWallet } from "@/components/wallet/PayWithWallet";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { Led, Module, PageHeader } from "@/components/ui";

export default function WalletPage() {
  return (
    <WalletProvider>
      <PageHeader eyebrow="Module · Wallet Connection" title={<>Pay with<br />your wallet.</>}>
        Connect your own Solana wallet and pay <code>/api/premium</code> with <strong>devnet test USDC</strong> (no real
        money). Your wallet shows each payment and asks you to approve it.
      </PageHeader>
      <div className="cols">
        <ConnectPanel />
        <PayPanel />
      </div>
    </WalletProvider>
  );
}

function ConnectPanel() {
  const [account] = useSelectedWalletAccount();
  return (
    <Module label="A · Connect" right={account ? <><Led tone="ok" /> Connected</> : <><Led /> Not connected</>}>
      <ConnectWallet />
    </Module>
  );
}

function PayPanel() {
  const [account] = useSelectedWalletAccount();
  return (
    <Module label="B · Pay" right="Max $0.10 per payment">
      {account ? (
        <PayWithWallet account={account} />
      ) : (
        <div className="empty">Connect a wallet first.</div>
      )}
    </Module>
  );
}
