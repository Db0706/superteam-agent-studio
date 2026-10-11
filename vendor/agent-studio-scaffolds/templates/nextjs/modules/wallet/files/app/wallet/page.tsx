"use client";

import Link from "next/link";
import { useSelectedWalletAccount } from "@solana/react";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { PayWithWallet } from "@/components/wallet/PayWithWallet";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export default function WalletPage() {
  return (
    <WalletProvider>
      <p><Link href="/">← Home</Link></p>
      <h1>Pay with your wallet</h1>
      <p className="muted">
        Connect your own Solana wallet and pay <code>/api/premium</code> with <strong>devnet test USDC</strong> (no real money).
        Your wallet shows each payment and asks you to approve it.
      </p>
      <ConnectWallet />
      <SelectedAccountPay />
    </WalletProvider>
  );
}

function SelectedAccountPay() {
  const [account] = useSelectedWalletAccount();
  return account ? <PayWithWallet account={account} /> : null;
}
