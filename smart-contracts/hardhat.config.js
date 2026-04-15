import hardhatEthers from "@nomicfoundation/hardhat-ethers";

export default {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          evmVersion: "london",
        },
      },
    ],
  },
  plugins: [hardhatEthers],





  networks: {
    // Defines the local Ganache network
    ganache: {
      type: "http",
      url: "http://127.0.0.1:7545", // Default Ganache GUI RPC URL
      // Ganache provides unlocked local accounts automatically.
    },
    localhost: {
      url: "http://127.0.0.1:8545", // Default hardhat node / ganache-cli RPC URL
    }
  }
};
