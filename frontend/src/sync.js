import { getOfflineVotes, removeOfflineVote } from './indexeddb';
import { decryptVoteData } from './crypto';

export async function checkServerOnline(apiBase, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBase}/ping`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      mode: 'cors'
    });
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncOfflineVotes({ apiBase, contract, wallet, passphrase, updateMessage }) {
  const pending = await getOfflineVotes();
  if (!pending.length) {
    return { synced: 0 };
  }

  let syncedCount = 0;
  for (const record of pending) {
    try {
      const voteData = await decryptVoteData(record.payload, passphrase);
      if (!wallet || wallet.toLowerCase() !== voteData.walletAddress.toLowerCase()) {
        updateMessage('Offline vote skipped: wallet mismatch during sync.');
        continue;
      }

      updateMessage('Syncing saved vote with MetaMask...');
      const tx = await contract.vote(voteData.candidateId);
      await tx.wait();

      const response = await fetch(`${apiBase}/submit-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: voteData.walletAddress,
          candidateId: voteData.candidateId,
          txHash: tx.hash
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync submission failed');
      }

      await removeOfflineVote(record.id);
      syncedCount += 1;
      updateMessage(`Sync successful: vote submitted with tx ${tx.hash}`);
    } catch (error) {
      console.error('Sync error:', error);
      updateMessage('Sync interrupted. A saved vote remains queued.');
      break;
    }
  }

  return { synced: syncedCount };
}
