import localforage from 'localforage';

const OFFLINE_VOTE_KEY = 'offlineVotesQueue';

export async function saveOfflineVote(encryptedPayload) {
  const stored = (await localforage.getItem(OFFLINE_VOTE_KEY)) || [];
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
    payload: encryptedPayload,
    createdAt: new Date().toISOString(),
  };
  stored.push(record);
  await localforage.setItem(OFFLINE_VOTE_KEY, stored);
  return record;
}

export async function getOfflineVotes() {
  return (await localforage.getItem(OFFLINE_VOTE_KEY)) || [];
}

export async function removeOfflineVote(id) {
  const stored = (await localforage.getItem(OFFLINE_VOTE_KEY)) || [];
  const next = stored.filter((record) => record.id !== id);
  await localforage.setItem(OFFLINE_VOTE_KEY, next);
}

export async function clearOfflineVotes() {
  await localforage.removeItem(OFFLINE_VOTE_KEY);
}
