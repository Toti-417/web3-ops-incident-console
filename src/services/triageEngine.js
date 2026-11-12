export const PRESET_INCIDENTS = [
  {
    id: 'eth-sample',
    label: 'Ethereum Mainnet TX (Sample)',
    chain: 'ethereum',
    hash: '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060'
  },
  {
    id: 'base-sample',
    label: 'Base L2 Latest Block TX',
    chain: 'base',
    hash: 'LATEST_TX'
  },
  {
    id: 'sol-sample',
    label: 'Solana Latest Slot TX',
    chain: 'solana',
    hash: 'LATEST_TX'
  }
];

const RPC_ENDPOINTS = [
  { id: 'ethereum', name: 'Ethereum Mainnet', url: 'https://eth.llamarpc.com', method: 'eth_blockNumber' },
  { id: 'base', name: 'Base L2', url: 'https://mainnet.base.org', method: 'eth_blockNumber' },
  { id: 'solana', name: 'Solana Mainnet', url: 'https://api.mainnet-beta.solana.com', method: 'getSlot' }
];

export async function checkRpcHealth() {
  return Promise.all(
    RPC_ENDPOINTS.map(async (ep) => {
      const start = performance.now();
      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: ep.method, params: [] })
        });
        const latencyMs = Math.round(performance.now() - start);
        const data = await res.json();
        const height = ep.id === 'solana' ? data.result : parseInt(data.result, 16);
        return {
          ...ep,
          status: res.ok && height ? 'HEALTHY' : 'DEGRADED',
          latencyMs,
          height: Number.isFinite(height) ? height.toLocaleString() : 'N/A'
        };
      } catch {
        return {
          ...ep,
          status: 'UNREACHABLE',
          latencyMs: Math.round(performance.now() - start),
          height: 'N/A'
        };
      }
    })
  );
}

function buildSupportDiagnosis(tx) {
  if (tx.status === 'FAILED') {
    const revertText = tx.revertReason || 'Execution reverted on-chain';
    return {
      severity: 'P1 - User Action / Contract Revert',
      rootCause: `Transaction reverted on ${tx.chainName}: ${revertText}. Common causes include slippage tolerance exceeded, insufficient token allowance, or out-of-gas.`,
      userReply: `Hi! We checked your transaction (${tx.hash.slice(0, 12)}...) on ${tx.chainName}. It failed on-chain due to: "${revertText}". Your funds were not transferred (only the network gas fee was consumed). Please try again with a slightly higher slippage/gas limit or confirm token approval first.`,
      escalationNote: `[SUPPORT ESCALATION] Chain: ${tx.chainName} | TX: ${tx.hash} | Status: FAILED | Revert: ${revertText} | Gas Used: ${tx.gasUsed}`
    };
  }
  return {
    severity: 'P3 - Confirmed On-Chain',
    rootCause: `Transaction is finalized/confirmed on ${tx.chainName} with ${tx.confirmations} confirmations. If the UI hasn't updated yet, it is likely an indexer/RPC cache delay.`,
    userReply: `Hi! Good news — your transaction (${tx.hash.slice(0, 12)}...) is confirmed on ${tx.chainName} (${tx.confirmations} confirmations). If your wallet or dApp balance hasn't refreshed yet, please hard-refresh or clear cache while the indexer syncs.`,
    escalationNote: `[INDEXER CHECK] Chain: ${tx.chainName} | TX: ${tx.hash} | Status: SUCCESS | Confirmations: ${tx.confirmations} | Method: ${tx.method}`
  };
}

export async function diagnoseTransaction(chain, rawHash) {
  let hash = (rawHash || '').trim();
  if (!hash) throw new Error('Enter a valid transaction hash or signature.');

  if (chain === 'solana') {
    const rpcUrl = 'https://api.mainnet-beta.solana.com';
    const rpc = async (method, params) => {
      const r = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    };

    if (hash === 'LATEST_TX') {
      const slot = await rpc('getSlot', []);
      const block = await rpc('getBlock', [slot, { maxSupportedTransactionVersion: 0, transactionDetails: 'signatures' }]);
      hash = block?.signatures?.[0];
      if (!hash) throw new Error('Could not fetch a recent Solana signature.');
    }

    const tx = await rpc('getTransaction', [hash, { maxSupportedTransactionVersion: 0 }]);
    if (!tx) throw new Error('Transaction not found on Solana Mainnet.');

    const failed = Boolean(tx.meta?.err);
    const feeSol = ((tx.meta?.fee || 0) / 1e9).toFixed(6);
    const result = {
      chain: 'solana',
      chainName: 'Solana Mainnet',
      hash,
      status: failed ? 'FAILED' : 'SUCCESS',
      method: 'Solana Program Instruction',
      from: tx.transaction?.message?.accountKeys?.[0] || '-',
      to: tx.transaction?.message?.accountKeys?.[1] || '-',
      fee: `${feeSol} SOL`,
      gasUsed: `${tx.meta?.computeUnitsConsumed || 0} CU`,
      confirmations: 'Finalized',
      timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : '-',
      revertReason: failed ? JSON.stringify(tx.meta.err) : null,
      explorerUrl: `https://solscan.io/tx/${hash}`
    };
    return { ...result, diagnosis: buildSupportDiagnosis(result) };
  }

  const apiBase = chain === 'base' ? 'https://base.blockscout.com/api/v2' : 'https://eth.blockscout.com/api/v2';
  const explorer = chain === 'base' ? 'https://base.blockscout.com' : 'https://eth.blockscout.com';
  const chainName = chain === 'base' ? 'Base L2' : 'Ethereum Mainnet';

  if (hash === 'LATEST_TX') {
    const listRes = await fetch(`${apiBase}/transactions?filter=validated`);
    const listJson = await listRes.json();
    hash = listJson?.items?.[0]?.hash;
    if (!hash) throw new Error(`Could not fetch latest transaction from ${chainName}.`);
  }

  const res = await fetch(`${apiBase}/transactions/${hash}`);
  if (!res.ok) throw new Error(`Blockscout returned HTTP ${res.status} for ${chainName}`);
  const data = await res.json();

  const isSuccess = data.status === 'ok' || data.result === 'success';
  const feeEth = data.fee?.value ? (Number(data.fee.value) / 1e18).toFixed(6) : '0';

  const result = {
    chain,
    chainName,
    hash: data.hash,
    status: isSuccess ? 'SUCCESS' : 'FAILED',
    method: data.method || data.tx_types?.[0] || 'transfer',
    from: data.from?.hash || '-',
    to: data.to?.hash || '-',
    fee: `${feeEth} ETH`,
    gasUsed: data.gas_used ? Number(data.gas_used).toLocaleString() : '-',
    confirmations: data.confirmations ?? 'Confirmed',
    timestamp: data.timestamp || '-',
    revertReason: !isSuccess ? (data.revert_reason?.raw || data.result || 'Reverted') : null,
    explorerUrl: `${explorer}/tx/${data.hash}`
  };

  return { ...result, diagnosis: buildSupportDiagnosis(result) };
}

