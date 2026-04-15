import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import contractConfig from './config/contract.json';
import { encryptVoteData } from './crypto';
import { saveOfflineVote } from './indexeddb';
import { checkServerOnline, syncOfflineVotes } from './sync';

const API_BASE = 'http://127.0.0.1:5000/api';
const ENCRYPTION_SECRET = 'voter-offline-secret';

function App() {
  const [wallet, setWallet] = useState(null);
  const [contract, setContract] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isVerified, setIsVerified] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Connect your wallet to begin voting.');
  const [step, setStep] = useState('register');

  const [voterId, setVoterId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactType, setContactType] = useState('email');
  const [otp, setOtp] = useState('');

  const connectWallet = async () => {
    if (!window.ethereum) {
      setMessage('Please install MetaMask to continue.');
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const account = accounts[0];
      setWallet(account);

      const network = await provider.getNetwork();
      const allowedChainIds = [1337, 5777];
      if (!allowedChainIds.includes(network.chainId)) {
        setMessage(`Please switch MetaMask to Ganache localhost:7545. Current chainId is ${network.chainId}.`);
        return;
      }

      if (contractConfig && contractConfig.address) {
        const deployedCode = await provider.getCode(contractConfig.address);
        if (!deployedCode || deployedCode === '0x') {
          setMessage(`No contract found at ${contractConfig.address} on the current MetaMask network.`);
          return;
        }

        const votingContract = new ethers.Contract(contractConfig.address, contractConfig.abi, signer);
        setContract(votingContract);

        const verified = await votingContract.isVerified(account);
        const voted = await votingContract.hasVoted(account);
        setIsVerified(verified);
        setHasVoted(voted);
        setStep(verified ? 'vote' : 'register');
      }

      setMessage('Wallet connected. Register or login with your voter details.');
    } catch (err) {
      console.error(err);
      setMessage('Wallet connection failed.');
    }
  };

  const fetchCandidates = async () => {
    if (!contract) return;
    try {
      const data = await contract.getAllCandidates();
      setCandidates(data.map((item) => ({
        id: parseInt(item.id.toString(), 10),
        name: item.name,
        voteCount: parseInt(item.voteCount.toString(), 10)
      })));
    } catch (error) {
      console.error('Failed to load candidates', error);
      setMessage('Unable to load candidate list. Check contract deployment and MetaMask network.');
    }
  };

  const updateNetworkStatus = useCallback(async () => {
    const online = await checkServerOnline(API_BASE);
    setIsOnline(online);
    return online;
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const online = await updateNetworkStatus();
      setMessage(online ? 'Online: ready to sync and submit votes.' : 'Offline: votes will save securely in your browser.');
      if (online && contract && wallet) {
        await syncOfflineVotes({ apiBase: API_BASE, contract, wallet, passphrase: ENCRYPTION_SECRET, updateMessage: setMessage });
        await fetchCandidates();
      }
    }, 7000);
    return () => clearInterval(interval);
  }, [contract, wallet, updateNetworkStatus]);

  useEffect(() => {
    if (contract) {
      fetchCandidates();
    }
  }, [contract]);

  const registerVoter = async (event) => {
    event.preventDefault();
    if (!voterId || !name || !email || !phone) {
      setMessage('Please fill in all registration fields.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/register-voter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId, name, email, phone })
      });
      const data = await response.json();
      if (response.ok) {
        setStep('otp');
        setMessage(data.message || 'Registration complete. Request OTP to continue.');
      } else {
        setMessage(data.error || 'Could not register voter.');
      }
    } catch (error) {
      console.error('Registration error', error);
      setIsOnline(false);
      setMessage(`Unable to reach the server for registration. ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const requestOTP = async (event) => {
    event.preventDefault();
    if (!voterId) {
      setMessage('Please enter your Voter ID.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId, contactType })
      });
      const data = await response.json();
      if (response.ok) {
        setStep('otp');
        setMessage(data.simulation ? `OTP generated. Use ${data.otp} to verify.` : 'OTP sent to your registered contact.');
      } else {
        setMessage(data.error || 'OTP request failed.');
      }
    } catch (error) {
      console.error('OTP request failed', error);
      setIsOnline(false);
      setMessage(`Unable to reach server for OTP request. ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (event) => {
    event.preventDefault();
    if (!otp || !voterId) {
      setMessage('Please enter voter ID and OTP.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId, contactType, otp, walletAddress: wallet })
      });
      const data = await response.json();
      if (response.ok) {
        setIsVerified(true);
        setStep('vote');
        setMessage(data.message || 'OTP verified. You may now vote.');
      } else {
        setMessage(data.error || 'OTP verification failed.');
      }
    } catch (error) {
      console.error('Verification error', error);
      setIsOnline(false);
      setMessage(`Unable to verify OTP at this time. ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const submitVoteRecord = async (walletAddress, candidateId, txHash) => {
    const response = await fetch(`${API_BASE}/submit-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, candidateId, txHash })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Vote record failed');
    }
    return data;
  };

  const handleVote = async (candidateId) => {
    if (!wallet) {
      setMessage('Connect your wallet first.');
      return;
    }
    if (!isVerified) {
      setMessage('Please verify OTP before voting.');
      return;
    }
    if (!contract) {
      setMessage('Smart contract not initialized.');
      return;
    }
    if (hasVoted) {
      setMessage('You have already voted.');
      return;
    }

    if (!isOnline) {
      const payload = { walletAddress: wallet, candidateId, voterId, email, phone, timestamp: new Date().toISOString() };
      const encrypted = await encryptVoteData(payload, ENCRYPTION_SECRET);
      await saveOfflineVote(encrypted);
      setMessage('Offline: vote saved locally and will sync when internet is restored.');
      return;
    }

    setLoading(true);
    try {
      setMessage('Please confirm the vote transaction in MetaMask...');
      const tx = await contract.vote(candidateId);
      await tx.wait();
      await submitVoteRecord(wallet, candidateId, tx.hash);
      setHasVoted(true);
      setMessage('Online: vote submitted and recorded successfully.');
      await fetchCandidates();
    } catch (error) {
      console.error('Voting error', error);
      setMessage(error.reason || error.message || 'Voting failed.');
    } finally {
      setLoading(false);
    }
  };

  const renderRegistration = () => (
    <form onSubmit={registerVoter} className="space-y-4 animate-fade-in-up">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Voter ID</label>
        <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary p-3 border" value={voterId} onChange={(e) => setVoterId(e.target.value)} placeholder="Enter Voter ID" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary p-3 border" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input type="email" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary p-3 border" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary p-3 border" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91-9876543210" required />
      </div>
      <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors disabled:opacity-50">
        {loading ? 'Registering...' : 'Register / Login'}
      </button>
    </form>
  );

  const renderOtpRequest = () => (
    <form onSubmit={requestOTP} className="space-y-4 animate-fade-in-up">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Method</label>
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="contactType" value="email" checked={contactType === 'email'} onChange={() => setContactType('email')} />
            Email
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="contactType" value="phone" checked={contactType === 'phone'} onChange={() => setContactType('phone')} />
            Phone
          </label>
        </div>
      </div>
      <button type="submit" disabled={loading} className="w-full bg-secondary hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors disabled:opacity-50">
        {loading ? 'Requesting OTP...' : 'Request OTP'}
      </button>
    </form>
  );

  const renderOtpVerify = () => (
    <form onSubmit={verifyOTP} className="space-y-4 animate-fade-in-up">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
        <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary p-3 border" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter OTP" required />
      </div>
      <button type="submit" disabled={loading} className="w-full bg-secondary hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors disabled:opacity-50">
        {loading ? 'Verifying...' : 'Verify OTP'}
      </button>
    </form>
  );

  const renderVotingBoard = () => (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center justify-between bg-green-50 p-4 rounded-lg border border-green-200">
        <div className="text-green-800 font-medium">Identity Confirmed</div>
        {hasVoted && <div className="text-sm bg-green-200 text-green-800 px-3 py-1 rounded-full">Vote Recorded</div>}
      </div>
      <div className="grid gap-4">
        {candidates.map((cand) => (
          <div key={cand.id} className="flex justify-between items-center bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xl font-bold text-gray-800">{cand.name}</h3>
              <p className="text-sm text-gray-500 mt-1">Votes: {cand.voteCount}</p>
            </div>
            <button
              onClick={() => handleVote(cand.id)}
              disabled={hasVoted || loading}
              className={`py-2 px-6 rounded-full font-bold transition-all ${
                hasVoted ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-primary text-white hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              Vote
            </button>
          </div>
        ))}
        {candidates.length === 0 && (
          <div className="text-center text-gray-500 py-10">No candidates available. Waiting for admin to add them.</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full glass rounded-3xl p-8 transform transition-all">
        <div className="flex justify-between items-center mb-8 border-b pb-4">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Secure Voting
          </h1>
          <div className="flex items-center space-x-2">
            <span className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></span>
            <span className="text-sm font-medium text-gray-600">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        {message && (
          <div className="mb-6 px-4 py-3 bg-indigo-50 border-l-4 border-primary text-indigo-700 rounded shadow-sm transition-all">
            {message}
          </div>
        )}

        {!wallet ? (
          <div className="text-center py-10">
            <h2 className="text-xl font-semibold mb-6 text-gray-700">Connect to Web3</h2>
            <button
              onClick={connectWallet}
              className="bg-primary hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              Connect MetaMask
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm break-all text-gray-600">
              <span className="font-bold text-gray-800">Connected: </span>
              {wallet}
            </div>
            {step === 'register' && renderRegistration()}
            {step === 'otp' && (
              <>
                {renderOtpRequest()}
                {renderOtpVerify()}
              </>
            )}
            {step === 'vote' && renderVotingBoard()}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
