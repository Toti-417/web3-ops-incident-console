import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Search, Copy, Check, RefreshCw, ExternalLink, Activity, GitBranch } from 'lucide-react';
import { PRESET_INCIDENTS, checkRpcHealth, diagnoseTransaction } from './services/triageEngine';

export default function App() {
  const [rpcHealth, setRpcHealth] = useState([]);
  const [chain, setChain] = useState('ethereum');
  const [hash, setHash] = useState(PRESET_INCIDENTS[0].hash);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  async function loadHealth() {
    const health = await checkRpcHealth();
    setRpcHealth(health);
  }

  async function runTriage(targetChain, targetHash) {
    setLoading(true);
    setError('');
    try {
      const res = await diagnoseTransaction(targetChain, targetHash);
      setResult(res);
      setHash(res.hash);
    } catch (err) {
      setError(err.message || 'Failed to diagnose transaction.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    runTriage(PRESET_INCIDENTS[0].chain, PRESET_INCIDENTS[0].hash);
  }, []);

  function copyText(key, text) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1800);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>
            <Wrench size={22} color="#38bdf8" />
            Web3 Protocol Support &amp; Incident Triage Console
          </h1>
          <p>Live RPC Health Monitor, Multi-Chain TX Debugger &amp; Support Escalation Generator</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="pill" href="https://web3-telemetry-tracker.vercel.app" target="_blank" rel="noreferrer">
            <Activity size={14} /> Telemetry Tracker
          </a>
          <a className="pill" href="https://github.com/Toti-417" target="_blank" rel="noreferrer">
            <GitBranch size={14} /> GitHub: Toti-417
          </a>
        </div>
      </header>

      <section className="grid-3" aria-label="Live RPC Health">
        {rpcHealth.map((ep) => (
          <motion.div
            key={ep.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="glass-panel card"
          >
            <div className="label">{ep.name} RPC</div>
            <div className={`val status-${ep.status}`}>{ep.status}</div>
            <div className="sub">Latency: {ep.latencyMs} ms &bull; Height: {ep.height}</div>
          </motion.div>
        ))}
      </section>

      <section className="glass-panel card" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="label">Transaction Incident Debugger</span>
          <button type="button" className="btn btn-secondary" onClick={loadHealth} style={{ padding: '6px 10px', fontSize: '0.78rem' }}>
            <RefreshCw size={13} /> Refresh RPC
          </button>
        </div>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            runTriage(chain, hash);
          }}
        >
          <select className="select" value={chain} onChange={(e) => setChain(e.target.value)} aria-label="Chain">
            <option value="ethereum">Ethereum Mainnet</option>
            <option value="base">Base L2</option>
            <option value="solana">Solana Mainnet</option>
          </select>
          <input
            className="input mono"
            type="text"
            placeholder="Paste TX hash (0x...) or Solana signature"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            aria-label="Transaction hash"
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <Search size={16} />
            {loading ? 'Diagnosing...' : 'Diagnose TX'}
          </button>
        </form>
        <div className="presets">
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Quick Samples:</span>
          {PRESET_INCIDENTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset-btn"
              onClick={() => {
                setChain(p.chain);
                setHash(p.hash);
                runTriage(p.chain, p.hash);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="error-box" role="alert">{error}</div>}

      {result && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid-2"
        >
          <div className="glass-panel card">
            <div className="label">On-Chain Execution Telemetry</div>
            <div className={`val status-${result.status}`} style={{ marginBottom: 10 }}>
              {result.status} &bull; {result.chainName}
            </div>
            <div className="kv">
              <div className="kv-key">Method</div><div>{result.method}</div>
              <div className="kv-key">From</div><div className="mono">{result.from.slice(0, 18)}...</div>
              <div className="kv-key">To / Program</div><div className="mono">{result.to.slice(0, 18)}...</div>
              <div className="kv-key">Network Fee</div><div className="mono">{result.fee}</div>
              <div className="kv-key">Gas / Compute</div><div className="mono">{result.gasUsed}</div>
              <div className="kv-key">Confirmations</div><div>{result.confirmations}</div>
              <div className="kv-key">Explorer</div>
              <div>
                <a href={result.explorerUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>
                  View on Explorer <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                </a>
              </div>
            </div>
          </div>

          <div className="glass-panel card">
            <div className="label">Support Root-Cause &amp; Ready-to-Send Reply</div>
            <div style={{ fontWeight: 700, marginTop: 8, color: '#38bdf8' }}>{result.diagnosis.severity}</div>
            <p style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: 6 }}>{result.diagnosis.rootCause}</p>

            <div className="label" style={{ marginTop: 14 }}>User Reply (Discord / Intercom / Telegram)</div>
            <textarea className="input" rows={4} readOnly value={result.diagnosis.userReply} style={{ width: '100%', marginTop: 6 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => copyText('reply', result.diagnosis.userReply)}>
                {copiedKey === 'reply' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'reply' ? 'Copied Reply' : 'Copy User Reply'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => copyText('ticket', result.diagnosis.escalationNote)}>
                {copiedKey === 'ticket' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'ticket' ? 'Copied Ticket' : 'Copy Escalation Ticket'}
              </button>
            </div>
          </div>
        </motion.section>
      )}
    </div>
  );
}

