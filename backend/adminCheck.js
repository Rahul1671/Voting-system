const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const contractPath = path.join(__dirname, 'config', 'contract.json');
const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:7545');

const key = process.env.PRIVATE_KEY;
console.log('PRIVATE_KEY value:', JSON.stringify(key));
console.log('PRIVATE_KEY length:', key?.length);
console.log('PRIVATE_KEY codes:', key ? Array.from(key).map((c) => c.charCodeAt(0)) : []);

const wallet = new ethers.Wallet(key, provider);
const contract = new ethers.Contract(contractData.address, contractData.abi, provider);

console.log('backend private key wallet:', wallet.address);
contract.admin().then((adminAddr) => {
  console.log('contract admin:', adminAddr);
  console.log('match:', adminAddr.toLowerCase() === wallet.address.toLowerCase());
}).catch((err) => {
  console.error('error reading contract admin:', err);
  process.exit(1);
});
