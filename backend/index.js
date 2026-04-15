require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const dataDir = path.join(__dirname, 'data');
const votersFile = path.join(dataDir, 'voters.json');
const votesFile = path.join(dataDir, 'votes.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(votersFile)) {
    fs.writeFileSync(votersFile, JSON.stringify([], null, 2), 'utf8');
}

if (!fs.existsSync(votesFile)) {
    fs.writeFileSync(votesFile, JSON.stringify([], null, 2), 'utf8');
}

const otpStore = new Map();

const readJson = (filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    } catch (error) {
        return [];
    }
};

const writeJson = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const getVoters = () => readJson(votersFile);
const saveVoters = (voters) => writeJson(votersFile, voters);
const getVotes = () => readJson(votesFile);
const saveVotes = (votes) => writeJson(votesFile, votes);

const findVoterById = (voterId) => getVoters().find((v) => v.voterId === voterId);
const findVoterByWallet = (walletAddress) =>
    getVoters().find((v) => v.walletAddress && v.walletAddress.toLowerCase() === walletAddress.toLowerCase());

const getOtpKey = (voterId, contactType, contactValue) =>
    `${voterId}:${contactType}:${contactValue.toLowerCase()}`;

const getContract = () => {
    try {
        const contractPath = path.join(__dirname, 'config', 'contract.json');
        if (!fs.existsSync(contractPath)) {
            console.error('Contract configuration not found. Please deploy smart contract first.');
            return null;
        }

        const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');

        let wallet;
        if (process.env.PRIVATE_KEY) {
            wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        } else {
            console.error('Please add your backend PRIVATE_KEY to backend/.env and ensure the local node is running.');
            return null;
        }

        return new ethers.Contract(contractData.address, contractData.abi, wallet);
    } catch (error) {
        console.error('Error loading contract:', error);
        return null;
    }
};

app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/register-voter', (req, res) => {
    const { voterId, name, email, phone } = req.body;

    if (!voterId || !name || !email || !phone) {
        return res.status(400).json({ error: 'Voter ID, name, email and phone are required' });
    }

    const voters = getVoters();
    const existing = findVoterById(voterId);

    if (existing) {
        if (existing.email !== email || existing.phone !== phone || existing.name !== name) {
            return res.status(409).json({ error: 'Voter ID already registered with different information' });
        }

        return res.json({ message: 'Voter already registered. Please request OTP.' });
    }

    voters.push({
        voterId,
        name,
        email,
        phone,
        walletAddress: null,
        verified: false,
        hasVoted: false,
        registeredAt: new Date().toISOString()
    });

    saveVoters(voters);
    return res.json({ message: 'Registration successful. Request OTP to verify your identity.' });
});

app.post('/api/request-otp', (req, res) => {
    const { voterId, contactType } = req.body;
    if (!voterId || !contactType) {
        return res.status(400).json({ error: 'Voter ID and contact type are required' });
    }

    if (!['email', 'phone'].includes(contactType)) {
        return res.status(400).json({ error: 'Contact type must be email or phone' });
    }

    const voter = findVoterById(voterId);
    if (!voter) {
        return res.status(404).json({ error: 'Voter ID not registered' });
    }

    const contactValue = voter[contactType];
    if (!contactValue) {
        return res.status(400).json({ error: `No ${contactType} stored for this voter` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(getOtpKey(voterId, contactType, contactValue), { otp, expiresAt });

    console.log('\n========================================');
    console.log('🔐 MOCK OTP DETAILS:');
    console.log(`Voter ID: ${voterId}`);
    console.log(`Contact: ${contactType}=${contactValue}`);
    console.log(`OTP Code: ${otp}`);
    console.log('========================================\n');

    return res.json({ message: 'OTP generated and sent to registered contact.', simulation: true, otp });
});

app.post('/api/verify-otp', async (req, res) => {
    const { voterId, contactType, otp, walletAddress } = req.body;

    if (!voterId || !contactType || !otp || !walletAddress) {
        return res.status(400).json({ error: 'Voter ID, contact type, OTP and wallet address are required' });
    }

    const voter = findVoterById(voterId);
    if (!voter) {
        return res.status(404).json({ error: 'Voter not found' });
    }

    const contactValue = voter[contactType];
    if (!contactValue) {
        return res.status(400).json({ error: `No ${contactType} stored for this voter` });
    }

    const key = getOtpKey(voterId, contactType, contactValue);
    const otpRecord = otpStore.get(key);
    if (!otpRecord) {
        return res.status(400).json({ error: 'No OTP requested for this voter and contact' });
    }

    if (Date.now() > otpRecord.expiresAt) {
        otpStore.delete(key);
        return res.status(400).json({ error: 'OTP has expired' });
    }

    if (otpRecord.otp !== otp) {
        return res.status(400).json({ error: 'Invalid OTP' });
    }

    otpStore.delete(key);

    if (voter.verified && voter.walletAddress && voter.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(409).json({ error: 'Voter is already linked to another wallet address' });
    }

    voter.verified = true;
    voter.walletAddress = walletAddress;
    voter.verifiedAt = new Date().toISOString();
    saveVoters(getVoters().map((item) => (item.voterId === voterId ? voter : item)));

    const contract = getContract();
    if (!contract) {
        return res.status(500).json({ error: 'Smart contract connection failed' });
    }

    try {
        const tx = await contract.verifyVoter(walletAddress);
        await tx.wait();
        return res.json({ message: 'OTP verified and wallet authenticated on-chain.', transactionHash: tx.hash });
    } catch (error) {
        console.error('Blockchain error:', error);
        if (error.reason && error.reason.includes('already verified')) {
            return res.json({ message: 'OTP verified. Wallet was already verified on-chain.' });
        }
        return res.status(500).json({ error: 'Blockchain verification failed. See server logs.' });
    }
});

app.post('/api/submit-vote', async (req, res) => {
    const { walletAddress, candidateId, txHash } = req.body;

    if (!walletAddress || candidateId === undefined || !txHash) {
        return res.status(400).json({ error: 'Wallet address, candidate ID and transaction hash are required' });
    }

    const voter = findVoterByWallet(walletAddress);
    if (!voter) {
        return res.status(404).json({ error: 'No verified voter found for this wallet' });
    }

    if (!voter.verified) {
        return res.status(403).json({ error: 'Voter is not verified' });
    }

    if (voter.hasVoted) {
        return res.status(409).json({ error: 'This voter has already voted' });
    }

    const votes = getVotes();
    if (votes.some((vote) => vote.txHash === txHash)) {
        return res.status(409).json({ error: 'This transaction has already been recorded' });
    }

    const contract = getContract();
    if (contract) {
        try {
            const hasVoted = await contract.hasVoted(walletAddress);
            if (hasVoted) {
                voter.hasVoted = true;
                saveVoters(getVoters().map((item) => (item.voterId === voter.voterId ? voter : item)));
                return res.status(409).json({ error: 'This wallet has already voted on-chain' });
            }
        } catch (err) {
            console.warn('Blockchain vote check failed:', err.message);
        }
    }

    votes.push({
        walletAddress,
        candidateId,
        txHash,
        status: 'confirmed',
        createdAt: new Date().toISOString()
    });

    saveVotes(votes);
    voter.hasVoted = true;
    voter.votedAt = new Date().toISOString();
    saveVoters(getVoters().map((item) => (item.voterId === voter.voterId ? voter : item)));

    return res.json({ message: 'Vote successfully recorded', txHash });
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
