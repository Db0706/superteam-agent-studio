## Wallet Connection: pay with your own wallet

Open http://localhost:3000/wallet. Visitors connect **their own** Solana wallet and buy `/api/premium` from it. Their wallet shows each payment and asks them to approve it, so no key is stored anywhere in this app.

**Try it:**
1. Install a Solana browser wallet ([Phantom](https://phantom.com), [Solflare](https://solflare.com) or [Backpack](https://backpack.app)) and switch it to **devnet** in its settings.
2. Get free devnet USDC for your wallet address at https://faucet.circle.com (choose Solana Devnet). No SOL is needed: the x402 facilitator pays the network fees.
3. Run `npm run dev`, open `/wallet`, connect, and press **Buy premium data**.

**What's ours and what isn't:** connecting, wallet detection and signing all come from the official Solana packages, [`@solana/react`](https://github.com/anza-xyz/kit/tree/main/packages/react) and [Wallet Standard](https://github.com/wallet-standard/wallet-standard), which their maintainers keep up to date. This template only wires them to x402: `useWalletAccountTransactionSigner` turns the connected wallet into a signer, and x402's `ExactSvmScheme` uses it to pay.

- `components/wallet/WalletProvider.tsx` offers only wallets that support devnet and remembers the visitor's choice.
- `components/wallet/PayWithWallet.tsx` refuses any single payment above **$0.10**, whatever the server asks for. Change `MAX_PAYMENT` to adjust it.
- It only ever pays on devnet. Going to mainnet takes a code change, not a setting.

**If a payment fails:**
- Check the wallet is on devnet and holds devnet USDC.
- Some wallets add their own safety instructions to transactions they sign. An x402 facilitator may reject those. If that happens, try another wallet.
