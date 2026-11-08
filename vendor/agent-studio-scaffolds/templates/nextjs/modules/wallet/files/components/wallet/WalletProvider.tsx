"use client";

import { SelectedWalletAccountContextProvider } from "@solana/react";
import type { UiWallet } from "@wallet-standard/react";
import type { ReactNode } from "react";

// Wallet detection and connection come from the official Solana packages
// (@solana/react + Wallet Standard). This file only says which wallets to offer
// and where to remember the visitor's choice.

/** Wallet Standard chain id for Solana devnet. This template never offers mainnet. */
export const WALLET_CHAIN = "solana:devnet" as const;

const STORAGE_KEY = "studio:selected-wallet-account";

const stateSync = {
  getSelectedWallet: () => (typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY)),
  storeSelectedWallet: (accountKey: string) => window.localStorage.setItem(STORAGE_KEY, accountKey),
  deleteSelectedWallet: () => window.localStorage.removeItem(STORAGE_KEY),
};

/** Only wallets that support devnet and can sign a transaction (needed to pay with x402). */
function filterWallets(wallet: UiWallet) {
  return wallet.chains.includes(WALLET_CHAIN) && wallet.features.includes("solana:signTransaction");
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <SelectedWalletAccountContextProvider filterWallets={filterWallets} stateSync={stateSync}>
      {children}
    </SelectedWalletAccountContextProvider>
  );
}
