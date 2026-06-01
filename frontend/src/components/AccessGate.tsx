import { useEffect, useMemo, useState } from 'react';
import { Cpu, Fingerprint, LockKeyhole, LogOut, Mail, ShieldCheck, Sparkles, UserRoundCheck, X } from 'lucide-react';
import {
  ACCESS_ADMIN_EMAIL,
  type AccessRequest,
  type AccessSession,
  clearAccessSession,
  getAccessRequest,
  getCurrentUser,
  isAdminEmail,
  isHostedAccessControlEnabled,
  listAccessRequests,
  loadAccessSession,
  logout,
  requestAccess,
  reviewAccessRequest,
  saveAccessSession,
  signIn,
  signUp,
} from '../lib/access';
import { isTauri } from '../lib/api';

type Mode = 'signin' | 'request';
type GateState = 'loading' | 'open' | 'locked' | 'pending' | 'denied' | 'admin';

interface AccessGateProps {
  children: React.ReactNode;
}

export function AccessGate({ children }: AccessGateProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [gateState, setGateState] = useState<GateState>('loading');
  const [session, setSession] = useState<AccessSession | null>(null);
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const protectedSite = isHostedAccessControlEnabled() && !isTauri();

  const stats = useMemo(() => {
    const pending = requests.filter((item) => item.status === 'pending').length;
    const approved = requests.filter((item) => item.status === 'approved').length;
    return { pending, approved };
  }, [requests]);

  const refreshAdminQueue = async (activeSession: AccessSession) => {
    const rows = await listAccessRequests(activeSession);
    setRequests(rows);
  };

  const evaluateSession = async (activeSession: AccessSession | null) => {
    if (!protectedSite) {
      setGateState('open');
      return;
    }
    if (!activeSession?.access_token) {
      setGateState('locked');
      return;
    }
    try {
      const user = await getCurrentUser(activeSession);
      const hydrated = { ...activeSession, user };
      saveAccessSession(hydrated);
      setSession(hydrated);
      if (isAdminEmail(user.email)) {
        await refreshAdminQueue(hydrated);
        setGateState('admin');
        return;
      }
      const row = await getAccessRequest(hydrated);
      setRequest(row);
      if (row?.status === 'approved') setGateState('open');
      else if (row?.status === 'denied') setGateState('denied');
      else setGateState('pending');
    } catch (err) {
      console.warn('Access session check failed', err);
      clearAccessSession();
      setSession(null);
      setGateState('locked');
    }
  };

  useEffect(() => {
    evaluateSession(loadAccessSession());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const activeSession = await signIn(email, password);
      setSession(activeSession);
      await evaluateSession(activeSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let activeSession: AccessSession | null = null;
      try {
        activeSession = await signUp(email, password, fullName);
      } catch (err) {
        const text = err instanceof Error ? err.message.toLowerCase() : '';
        if (!text.includes('already') && !text.includes('registered')) throw err;
        activeSession = await signIn(email, password);
      }
      if (!activeSession) {
        setMessage('Check your email to confirm the account, then sign in to finish the request.');
        setMode('signin');
        return;
      }
      const row = await requestAccess(activeSession, fullName, reason);
      setSession(activeSession);
      setRequest(row);
      setGateState(row.status === 'approved' ? 'open' : row.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Access request failed');
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, status: 'approved' | 'denied') => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await reviewAccessRequest(session, id, status);
      await refreshAdminQueue(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await logout(session);
    setSession(null);
    setRequest(null);
    setRequests([]);
    setGateState('locked');
  };

  if (gateState === 'open') return <>{children}</>;

  if (gateState === 'loading') {
    return (
      <div className="access-shell">
        <div className="access-loader">
          <span />
          <p>Calibrating access layer</p>
        </div>
      </div>
    );
  }

  return (
    <main className="access-shell">
      <section className="access-hero">
        <div className="access-scanline" />
        <div className="access-grid" />
        <div className="access-brand">
          <div className="access-mark">
            <Cpu size={22} />
          </div>
          <span>Flowlog Jarvis</span>
        </div>
        <div className="access-copy">
          <p className="access-kicker">Private Neural Interface</p>
          <h1>JARVIS access is closed.</h1>
          <p>
            This is a closed website only for invited people. Request clearance and wait for approval before the
            assistant console unlocks.
          </p>
        </div>
        <div className="access-hud">
          <div>
            <span>Core</span>
            <strong>Token shield active</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>Invite only</strong>
          </div>
          <div>
            <span>Admin</span>
            <strong>{ACCESS_ADMIN_EMAIL}</strong>
          </div>
        </div>
      </section>

      <section className="access-panel" aria-label="Access control">
        <div className="access-panel-head">
          <div>
            <p>{gateState === 'admin' ? 'Admin console' : 'Identity check'}</p>
            <h2>{gateState === 'admin' ? 'Approve access' : 'Request access'}</h2>
          </div>
          {session && (
            <button className="access-icon-button" type="button" onClick={signOut} title="Sign out">
              <LogOut size={16} />
            </button>
          )}
        </div>

        {gateState === 'admin' ? (
          <div className="access-admin">
            <div className="access-admin-stats">
              <div>
                <span>Pending</span>
                <strong>{stats.pending}</strong>
              </div>
              <div>
                <span>Approved</span>
                <strong>{stats.approved}</strong>
              </div>
            </div>
            {error && <p className="access-error">{error}</p>}
            <div className="access-request-list">
              {requests.length === 0 ? (
                <p className="access-muted">No requests yet.</p>
              ) : (
                requests.map((item) => (
                  <article className="access-request-card" key={item.id}>
                    <div>
                      <strong>{item.full_name || item.email}</strong>
                      <span>{item.email}</span>
                      {item.reason && <p>{item.reason}</p>}
                    </div>
                    <div className="access-review-actions">
                      <span className={`access-status access-status-${item.status}`}>{item.status}</span>
                      {item.status === 'pending' && (
                        <>
                          <button type="button" onClick={() => review(item.id, 'approved')} disabled={busy}>
                            <UserRoundCheck size={14} />
                            Approve
                          </button>
                          <button type="button" onClick={() => review(item.id, 'denied')} disabled={busy}>
                            <X size={14} />
                            Deny
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {(gateState === 'pending' || gateState === 'denied') && (
              <div className={`access-state-card ${gateState}`}>
                {gateState === 'pending' ? <ShieldCheck size={18} /> : <LockKeyhole size={18} />}
                <div>
                  <strong>{gateState === 'pending' ? 'Request pending' : 'Access denied'}</strong>
                  <p>
                    {gateState === 'pending'
                      ? 'Your request is waiting for admin approval.'
                      : 'This account is not cleared for this Jarvis console.'}
                  </p>
                </div>
              </div>
            )}

            <div className="access-tabs">
              <button className={mode === 'signin' ? 'active' : ''} type="button" onClick={() => setMode('signin')}>
                Sign in
              </button>
              <button className={mode === 'request' ? 'active' : ''} type="button" onClick={() => setMode('request')}>
                Request invite
              </button>
            </div>

            <form className="access-form" onSubmit={mode === 'signin' ? submitSignIn : submitRequest}>
              {mode === 'request' && (
                <label>
                  Name
                  <span>
                    <Fingerprint size={15} />
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
                  </span>
                </label>
              )}
              <label>
                Email
                <span>
                  <Mail size={15} />
                  <input
                    autoComplete="email"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </span>
              </label>
              <label>
                Password
                <span>
                  <LockKeyhole size={15} />
                  <input
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={8}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                </span>
              </label>
              {mode === 'request' && (
                <label>
                  Reason
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why do you need access?"
                    rows={3}
                  />
                </label>
              )}
              {message && <p className="access-message">{message}</p>}
              {error && <p className="access-error">{error}</p>}
              <button className="access-submit" type="submit" disabled={busy}>
                <Sparkles size={16} />
                {busy ? 'Processing...' : mode === 'signin' ? 'Unlock Jarvis' : 'Send request'}
              </button>
            </form>
            {request && <p className="access-muted">Current request status: {request.status}</p>}
          </>
        )}
      </section>
    </main>
  );
}
