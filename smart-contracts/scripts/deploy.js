import hre from "hardhat";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname fix for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Deploying Voting contract...");

  const { ethers } = await hre.network.connect();
  const Voting = await ethers.getContractFactory("Voting");
  const latestBlock = await ethers.provider.getBlock("latest");
  const gasLimit =
    latestBlock.gasLimit > 5000000n ? 5000000n : latestBlock.gasLimit - 100000n;

  const voting = await Voting.deploy({ gasLimit });

  await voting.waitForDeployment();
  const address = await voting.getAddress();

  console.log(`Voting contract deployed to: ${address}`);

  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/Voting.sol/Voting.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contractData = {
    address: address,
    abi: artifact.abi,
  };

  // Paths
  const frontendPath = path.join(__dirname, "../../frontend/src/config");
  const backendPath = path.join(__dirname, "../../backend/config");

  // Create folders if not exist
  if (!fs.existsSync(frontendPath)) {
    fs.mkdirSync(frontendPath, { recursive: true });
  }

  if (!fs.existsSync(backendPath)) {
    fs.mkdirSync(backendPath, { recursive: true });
  }

  // Save files
  fs.writeFileSync(
    path.join(frontendPath, "contract.json"),
    JSON.stringify(contractData, null, 2)
  );

  fs.writeFileSync(
    path.join(backendPath, "contract.json"),
    JSON.stringify(contractData, null, 2)
  );

  console.log("Contract context saved to frontend & backend");

  // Add default candidates
  console.log("Adding default candidates...");

  let tx1 = await voting.addCandidate("Alice");
  await tx1.wait();

  let tx2 = await voting.addCandidate("Bob");
  await tx2.wait();

  let tx3 = await voting.addCandidate("Charlie");
  await tx3.wait();

  console.log("Candidates added!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


