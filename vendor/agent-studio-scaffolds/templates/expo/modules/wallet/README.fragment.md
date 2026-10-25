## Wallet Connection

> **Android only.** Mobile Wallet Adapter connects to a wallet app on an Android phone, so this screen doesn't work in the browser version (`npm run web`); the rest of the app does.

**What you get:** a **Pay with your wallet** screen (`app/wallet.tsx`). People connect a Solana wallet app that is on the same phone (Phantom, Solflare, Backpack, …) and pay the companion's `GET /premium-data` from it. The wallet shows every payment, and they approve or reject it there. The app never sees a key.

**How it works:** [Solana Mobile Wallet Adapter](https://docs.solanamobile.com) (`@solana-mobile/mobile-wallet-adapter-protocol-kit`, maintained by Solana Mobile) opens the wallet app. `lib/wallet/mobileWallet.ts` turns the connected wallet into a `@solana/kit` signer, and `lib/wallet/pay.ts` gives that signer to the same x402 client the web template uses. The x402 facilitator pays the network fee, so the wallet only needs devnet USDC, not SOL. React Native has no WebCrypto, which `@solana/kit` uses for SHA-256, so `lib/wallet/crypto-polyfill.ts` provides it from Expo's own `expo-crypto`.

**This needs a development build, not Expo Go.** Mobile Wallet Adapter is native Android code, which Expo Go can't load. Build your own version of Expo Go once:

```bash
npm run android:dev    # builds and installs the app on a running emulator or a USB-connected phone (first build: 5 to 15 minutes)
```

After that, `npm start` works as before and the app reloads when you save. Run `npm run android:dev` again only when you add a native package. You need [Android Studio](https://developer.android.com/studio) (for the Android SDK and an emulator) and Java 17.

**Try it:**

1. Finish the payments setup in `companion-server/README.md` and start `npm run companion`.
2. Install a wallet app with Mobile Wallet Adapter on the phone or emulator, switch it to **devnet**, and send its address devnet USDC from https://faucet.circle.com.
3. Open **Pay with your wallet** in the app: **Connect wallet**, approve in the wallet, then **Buy premium data** and approve the payment.

A successful payment shows a transaction id. Tap it to see it on the Solana Explorer (devnet).

**If it fails:**

| Message | Fix |
| --- | --- |
| `No Solana wallet app found on this phone` | Install a wallet with Mobile Wallet Adapter (Phantom, Solflare, Backpack) |
| `insufficient_funds` or `simulation_failed` | The wallet has no devnet USDC yet: use the faucet. The companion's seller address needs a USDC account too (see the payments setup) |
| The app crashes with `SolanaMobileWalletAdapter` not found | You are in Expo Go. Use the development build: `npm run android:dev` |
| `You declined in the wallet` | Nothing was paid. Try again and approve |

Android only: Mobile Wallet Adapter doesn't exist on iOS.
