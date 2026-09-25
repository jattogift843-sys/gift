import { db } from '../db/store.js';
import { newId, nowISO, assertString } from '../utils/helpers.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';
import { notify } from './notification.service.js';

const NETWORKS = ['Bitcoin', 'ERC20', 'TRC20', 'BEP20', 'Solana', 'Litecoin', 'XRP Ledger', 'Polygon', 'Arbitrum', 'Other'];

export const walletNetworks = () => [...NETWORKS];

export async function listWallets(userId) {
  const rows = await db.wallets.find({ userId });
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function addWallet(userId, { label, network, address, asset }) {
  const cleanLabel = assertString(label, 'label', { max: 40 });
  const net = assertString(network, 'network', { max: 30 });
  if (!NETWORKS.includes(net)) throw badRequest('Choose a network from the list');
  const addr = assertString(address, 'address', { min: 12, max: 200 });
  if (await db.wallets.findOne({ userId, address: addr })) {
    throw badRequest('That wallet address is already linked');
  }
  const wallet = await db.wallets.insert({
    id: newId('wlt'),
    userId,
    label: cleanLabel,
    network: net,
    asset: asset ? assertString(asset, 'asset', { max: 12 }).toUpperCase() : '',
    address: addr,
    verified: false,
    createdAt: nowISO(),
  });
  notify(userId, { type: 'wallet', title: 'Crypto wallet linked', body: `${cleanLabel} (${net}) was added to your account.`, level: 'info' });
  return wallet;
}

export async function removeWallet(userId, id) {
  const w = await db.wallets.findById(id);
  if (!w) throw notFound('Wallet not found');
  if (w.userId !== userId) throw forbidden();
  await db.wallets.remove(id);
  return { id, removed: true };
}

/* admin */
export async function setWalletVerified(id, verified) {
  const w = await db.wallets.findById(id);
  if (!w) throw notFound('Wallet not found');
  await db.wallets.update(id, { verified: Boolean(verified) });
  notify(w.userId, {
    type: 'wallet',
    title: verified ? 'Wallet verified' : 'Wallet verification removed',
    body: `${w.label} (${w.network})`,
    level: verified ? 'success' : 'warning',
  });
  return db.wallets.findById(id);
}
