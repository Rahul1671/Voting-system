# Full Stack Blockchain Voting System

A decentralized, offline-capable voting application with off-chain user verification.

## 📁 Folder Structure

```
d:\Voting System\
├── backend/                  # Node.js + Express backend (Off-chain Verification)
│   ├── index.js              # Main server code
│   ├── package.json          # Dependencies
│   └── .env                  # Environment Variables (RPC_URL, PRIVATE_KEY)
├── frontend/                 # React + Vite frontend (UI + Offline Sync)
│   ├── src/                  # React components and logic
│   │   ├── App.jsx           # Main Application implementation
│   │   ├── index.css         # TailwindCSS styling
│   │   └── config/           # Auto-generated smart contract config
│   ├── package.json          # Dependencies
│   └── tailwind.config.js    # Styling configuration
└── smart-contracts/          # Solidity Smart Contracts
    ├── contracts/
    │   └── Voting.sol        # Core voting logic
    ├── scripts/
    │   └── deploy.js         # Deployment & Setup script
    ├── hardhat.config.js     # Ganache and local-node configuration
    └── package.json          # Dependencies
```

## 🚀 Setup Instructions

### Prerequisites
1. **Node.js** installed.
2. **Ganache GUI** or **ganache-cli** installed and running on `http://127.0.0.1:7545`.
3. **MetaMask** installed in your browser, connected to your Ganache local network (Network ID 5777, RPC URL `http://127.0.0.1:7545`).
4. Import at least one Ganache test account into MetaMask using its private key so you have test ETH.

### Phase 1: Smart Contract Deployment
1. Open a terminal and navigate to `smart-contracts`:
   ```bash
   cd "d:\Voting System\smart-contracts"
   ```
2. Compile and strictly deploy the smart contract to your local Ganache:
   ```bash
   npx hardhat run scripts/deploy.js --network ganache
   ```
3. *Note: The deployment script will automatically copy the generated `contract.json` (ABI & Address) into the `frontend/src/config/` and `backend/config/` folders.*

### Phase 2: Start the Backend (Verification Server)
1. Navigate to the backend folder:
   ```bash
   cd "d:\Voting System\backend"
   ```
2. Create a `.env` file in the `backend` folder and add your Ganache Admin Private Key (this must be the account that deployed the contract, i.e., Account 0 in Ganache):
   ```env
   PRIVATE_KEY="0xYOUR_GANACHE_PRIVATE_KEY_HERE"
   RPC_URL="http://127.0.0.1:7545"
   ```
3. Start the server:
   ```bash
   node index.js
   ```
4. *The server should now be running on `http://localhost:5000`*.

### Phase 3: Start the Frontend (User Interface)
1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd "d:\Voting System\frontend"
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to the provided local URL (usually `http://localhost:5173`).

---

## 🛑 How to Use the App

1. **Connect Wallet:** Click "Connect MetaMask" to link your account.
2. **Request OTP:** Enter an email or phone structure. The backend console will print out the 6-digit mock OTP.
3. **Verify Identity:** Enter the OTP into the frontend. The backend will verify it, and then execute a transaction to whitelist your wallet address on the blockchain (`verifyVoter(address)`).
4. **Vote (Online):** Select a candidate and vote. MetaMask will prompt you to confirm the transaction.
5. **Vote (Offline):** 
   - Disconnect your internet connection (turn off Wi-Fi or set browser to offline mode).
   - Click "Vote" on a candidate. It will be saved securely to `localStorage`.
   - Reconnect your internet.
   - The application automatically detects that it's back online and will immediately prompt MetaMask to sign and send the pending transaction across.

---

> Built with Solidity, React, TailwindCSS, Express, and Ethers.js
