import type { FrameworkId } from "./schema";

/**
 * "First 10 minutes": from a downloaded ZIP to a first paid request, for students
 * who have never used crypto. Every command here is copied from the starter
 * templates' READMEs (vendor/agent-studio-scaffolds); a unit test fails if one drifts.
 */

export interface GuideCommand {
  /** What it does, in plain words. Shown as a comment above the command. */
  what: string;
  cmd: string;
}

export interface GuideStep {
  id: "download" | "install" | "wallets" | "faucet" | "run" | "pay";
  title: string;
  minutes: string;
  body: string;
  commands: GuideCommand[];
  /** What the student should see when the step worked. */
  check: string;
}

export interface FrameworkGuide {
  framework: FrameworkId;
  needs: string;
  /** Where the commands run, when it is not the project folder. */
  where?: string;
  steps: GuideStep[];
}

/** The Builder modules the guide's download link selects. Paid API needs Payments and Spending. */
export const GUIDE_MODULES = ["payments", "spending", "paidapi"] as const;

export const FAUCET_URL = "https://faucet.circle.com";
export const EXPLORER_URL = "https://explorer.solana.com/?cluster=devnet";

const download: GuideStep = {
  id: "download",
  title: "Download your starter",
  minutes: "1 MIN",
  body: "The button below opens Build with the Paid API Example already ticked. It adds Payments and Spending Controls for you. Press Generate Project, then Download ZIP. Unzip it and open the folder in your editor and a terminal.",
  commands: [],
  check: "A folder named my-first-paid-agent with a README.md inside.",
};

const faucet = (who: string): GuideStep => ({
  id: "faucet",
  title: "Get free test money",
  minutes: "3 MIN",
  body: `Open faucet.circle.com, choose Solana Devnet and USDC, paste the first address and request. Then do the same for the second. ${who} The faucet has a robot check, so this part is by hand.`,
  commands: [],
  check: "Two faucet requests done, one per address.",
});

export const GUIDES: Record<FrameworkId, FrameworkGuide> = {
  next: {
    framework: "next",
    needs: "Node.js 20.9 or newer. Check with node -v.",
    steps: [
      download,
      {
        id: "install",
        title: "Install it",
        minutes: "2 MIN",
        body: "This downloads the project's libraries and makes your private settings file. .env.local stays on your laptop and is never committed to git.",
        commands: [
          { what: "Install the libraries", cmd: "npm install" },
          { what: "Make your private settings file (once only: running it again wipes your wallets and keys)", cmd: "cp .env.example .env.local" },
        ],
        check: "npm install finishes without a red error.",
      },
      {
        id: "wallets",
        title: "Make two test wallets",
        minutes: "1 MIN",
        body: "A payment needs someone who pays and someone who gets paid. These commands make both and write them into .env.local. They are throwaway devnet wallets: no app, no sign-up, no seed phrase to write down.",
        commands: [
          { what: "Where payments arrive (the seller)", cmd: "npm run keygen -- --pay-to" },
          { what: "Who pays (your agent)", cmd: "npm run keygen" },
        ],
        check: "Each command prints an address: a long string of letters and numbers. Keep both handy.",
      },
      faucet("Both need it: the agent so it can pay, the seller so it has an account to receive into."),
      {
        id: "run",
        title: "Start the app",
        minutes: "1 MIN",
        body: "First check both wallets have test USDC, then start the app and open http://localhost:3000.",
        commands: [
          { what: "Both lines should show ✓", cmd: "npm run wallets" },
          { what: "Start the app", cmd: "npm run dev" },
        ],
        check: "The home page says your app is running and lists the Paid API.",
      },
      {
        id: "pay",
        title: "Make your first paid request",
        minutes: "1 MIN",
        body: "Open http://localhost:3000/premium and press the two buttons in order: the first shows the 402 Payment Required answer and its price, the second lets your agent pay $0.01 of test USDC. Or do it from a second terminal:",
        commands: [
          { what: "The price, without paying", cmd: "curl -i http://localhost:3000/api/premium" },
          { what: "Pay once and get the data", cmd: "npm run pay" },
        ],
        check: "A receipt with a transaction id. Paste it into the Solana Explorer on devnet to see your payment on chain.",
      },
    ],
  },
  node: {
    framework: "node",
    needs: "Node.js 20.12 or newer. Check with node -v.",
    steps: [
      download,
      {
        id: "install",
        title: "Install it",
        minutes: "2 MIN",
        body: "This downloads the project's libraries and makes your private settings file. .env.local stays on your laptop and is never committed to git.",
        commands: [
          { what: "Install the libraries", cmd: "npm install" },
          { what: "Make your private settings file (once only: running it again wipes your wallets and keys)", cmd: "cp .env.example .env.local" },
        ],
        check: "npm install finishes without a red error.",
      },
      {
        id: "wallets",
        title: "Make two test wallets",
        minutes: "1 MIN",
        body: "A payment needs someone who pays and someone who gets paid. These commands make both and write them into .env.local. They are throwaway devnet wallets: no app, no sign-up, no seed phrase to write down.",
        commands: [
          { what: "Where payments arrive (the seller)", cmd: "npm run keygen -- --pay-to" },
          { what: "Who pays (your agent)", cmd: "npm run keygen" },
        ],
        check: "Each command prints an address: a long string of letters and numbers. Keep both handy.",
      },
      faucet("Both need it: the agent so it can pay, the seller so it has an account to receive into."),
      {
        id: "run",
        title: "Start the service",
        minutes: "1 MIN",
        body: "First check both wallets have test USDC, then start the service and open http://localhost:3000.",
        commands: [
          { what: "Both lines should show ✓", cmd: "npm run wallets" },
          { what: "Start the service", cmd: "npm run dev" },
        ],
        check: "The page says your service is running and lists its endpoints.",
      },
      {
        id: "pay",
        title: "Make your first paid request",
        minutes: "1 MIN",
        body: "Keep the service running and open a second terminal in the same folder.",
        commands: [
          { what: "The price, without paying (402 Payment Required)", cmd: "curl -i http://localhost:3000/premium-data" },
          { what: "Pay once and get the data", cmd: "npm run pay" },
        ],
        check: "A receipt with a transaction id. Paste it into the Solana Explorer on devnet to see your payment on chain.",
      },
    ],
  },
  python: {
    framework: "python",
    needs: "Python 3.10 or newer. Check with python3 --version.",
    steps: [
      download,
      {
        id: "install",
        title: "Install it",
        minutes: "2 MIN",
        body: "This makes a private Python environment for the project, installs its libraries and makes your settings file. In every new terminal, run the activate line again first.",
        commands: [
          { what: "Make the project's Python environment", cmd: "python3 -m venv .venv" },
          { what: "Switch it on (Windows: .venv\\Scripts\\activate)", cmd: "source .venv/bin/activate" },
          { what: "Install the libraries", cmd: "pip install -r requirements.txt" },
          { what: "Make your private settings file (once only: running it again wipes your wallets and keys)", cmd: "cp .env.example .env" },
        ],
        check: "pip finishes without a red error.",
      },
      {
        id: "wallets",
        title: "Make two test wallets",
        minutes: "1 MIN",
        body: "A payment needs someone who pays and someone who gets paid. These commands make both and write them into .env. They are throwaway devnet wallets: no app, no sign-up, no seed phrase to write down.",
        commands: [
          { what: "Where payments arrive (the seller)", cmd: "python -m agent keygen --pay-to" },
          { what: "Who pays (your agent)", cmd: "python -m agent keygen" },
        ],
        check: "Each command prints an address: a long string of letters and numbers. Keep both handy.",
      },
      faucet("Both need it: the agent so it can pay, the seller so it has an account to receive into."),
      {
        id: "run",
        title: "Start the service",
        minutes: "1 MIN",
        body: "First check both wallets have test USDC, then start the agent's HTTP service and open http://localhost:3000.",
        commands: [
          { what: "Both lines should show ✓", cmd: "python -m agent wallets" },
          { what: "Start the service", cmd: "python -m agent serve --reload" },
        ],
        check: "The page says your agent is running and lists its commands.",
      },
      {
        id: "pay",
        title: "Make your first paid request",
        minutes: "1 MIN",
        body: "Keep the service running and open a second terminal in the same folder. Activate the environment there too.",
        commands: [
          { what: "The price, without paying (402 Payment Required)", cmd: "curl -i http://localhost:3000/premium-data" },
          { what: "Your agent pays once and gets the data", cmd: "python -m agent buy" },
        ],
        check: "A receipt with a transaction id. Paste it into the Solana Explorer on devnet to see your payment on chain.",
      },
    ],
  },
  expo: {
    framework: "expo",
    needs: "Node.js 20.19.4 or newer and a web browser. No phone needed: the app runs in your browser (an Android phone with Expo Go also works).",
    where: "The app never holds a wallet key. Payments happen in a small companion server that comes in the ZIP, in companion-server/.",
    steps: [
      download,
      {
        id: "install",
        title: "Install it",
        minutes: "2 MIN",
        body: "Install the app, then the companion server, then make the companion's private settings file. .env.local stays on your laptop and is never committed to git.",
        commands: [
          { what: "Install the app", cmd: "npm install" },
          { what: "Install the companion server", cmd: "npm run companion:install" },
          { what: "Go into the companion's folder", cmd: "cd companion-server" },
          { what: "Make its private settings file (once only: running it again wipes your wallets and keys)", cmd: "cp .env.example .env.local" },
        ],
        check: "Both installs finish without a red error.",
      },
      {
        id: "wallets",
        title: "Make two test wallets",
        minutes: "1 MIN",
        body: "Still inside companion-server. A payment needs someone who pays and someone who gets paid. These commands make both. They are throwaway devnet wallets: no app, no sign-up, no seed phrase to write down.",
        commands: [
          { what: "Where payments arrive (the seller)", cmd: "npm run keygen -- --pay-to" },
          { what: "Who pays (the companion's agent)", cmd: "npm run keygen" },
        ],
        check: "Each command prints an address: a long string of letters and numbers. Keep both handy.",
      },
      faucet("Both need it: the agent so it can pay, the seller so it has an account to receive into."),
      {
        id: "run",
        title: "Start the companion and the app",
        minutes: "2 MIN",
        body: "Check the wallets, go back to the app's folder and start the companion. Then start the app in a second terminal: it opens in your browser. Each terminal prints one line and then waits; that's normal, leave both running. (On an Android phone, run npm start instead and scan the QR code with Expo Go.)",
        commands: [
          { what: "Both lines should show ✓", cmd: "npm run wallets" },
          { what: "Back to the app's folder", cmd: "cd .." },
          { what: "Terminal 1: the companion server", cmd: "npm run companion" },
          { what: "Terminal 2: the app, in your browser", cmd: "npm run web" },
        ],
        check: "The app opens and its Companion server panel says ONLINE.",
      },
      {
        id: "pay",
        title: "Make your first paid request",
        minutes: "1 MIN",
        body: "In the app, click Premium data. Call without paying shows the price the companion asks for; Let the agent pay spends $0.01 of test USDC.",
        commands: [],
        check: "A transaction id. Tap it to see your payment on chain in the Solana Explorer.",
      },
    ],
  },
};

/** Plain-language words for students who have never used crypto. */
export const GLOSSARY: Array<[word: string, meaning: string]> = [
  ["Devnet", "Solana's practice network. Everything works like the real thing, but the money is free and worth nothing."],
  ["USDC", "A digital dollar. On devnet it is test USDC from a faucet, so nothing you do here costs anything."],
  ["Wallet", "An address that can hold money, like an account number, plus a secret key that lets you spend it, like a password."],
  ["402 Payment Required", "An old web error code that x402 puts to use: the server answers with a price instead of the data."],
  ["Facilitator", "A free service at x402.org that checks a payment and puts it on Solana for you. It also pays the network fee."],
];

/** When something goes wrong in the first 10 minutes. Matches the templates' "If it fails" tables. */
export const TROUBLESHOOTING: Array<[message: string, fix: string]> = [
  ["PAY_TO_ADDRESS is not set", "Run the seller keygen command from step 03, then restart the app or service."],
  ["AGENT_PRIVATE_KEY is not set", "Run the second keygen command from step 03."],
  ["insufficient_funds or simulation_failed", "Run the wallets command. One of the two addresses has no test USDC yet: request it at the faucet."],
  ["Port 3000 is already in use", "Another app is using it. Stop that app first, then start this one again."],
];
