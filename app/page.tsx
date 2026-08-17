"use client";

import { useEffect, useState, useCallback } from "react";

type Org = {
  id: string;
  name: string;
  status: string;
  state: string | null;
  city: string | null;
  website: string | null;
  email: string | null;
  notes: string | null;
  research_summary: string | null;
  research_hook: string | null;
};

type Draft = { subject: string; body: string; is_fallback: boolean } | null;
type Source = { url: string; title: string | null; excerpt: string | null };

export default function Home() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ org: Org; draft: Draft; sources: Source[] } | null>(null);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadOrgs = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/orgs?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = await res.json();
      setOrgs(json.orgs ?? []);
      setLoadError("");
    } catch (e) {
      setOrgs([]);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [q, statusFilter]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const org = params.get("org");
    if (org) setSelectedId(org);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/orgs/${selectedId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        return r.json();
      })
      .then((json) => {
        setDetail(json);
        setSubjectDraft(json.draft?.subject ?? "");
        setBodyDraft(json.draft?.body ?? "");
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [selectedId]);

  async function pushToGmail() {
    if (!selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/orgs/${selectedId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectDraft, body: bodyDraft, action: "push" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("Pushed to Gmail drafts.");
      loadOrgs();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await fetch(`/api/orgs/${selectedId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      setMessage("Queued for regeneration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="pane">
        <div className="field">
          <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {["discovered", "email_found", "researched", "drafted", "draft_in_gmail", "needs_manual", "suppressed", "sent"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {loadError && <p className="error-text">Failed to load schools: {loadError}</p>}
        {!loadError && orgs.length === 0 && (
          <p style={{ color: "var(--col-text-muted)" }}>
            No schools yet — run <code>npm run seed</code> against a real Supabase project.
          </p>
        )}
        {orgs.map((o) => (
          <div
            key={o.id}
            className={`queue-item${o.id === selectedId ? " active" : ""}`}
            onClick={() => setSelectedId(o.id)}
          >
            <div>{o.name}</div>
            <span className={`badge status-${o.status}`}>{o.status}</span>
          </div>
        ))}
      </div>

      <div className="pane">
        {!detail ? (
          <p style={{ color: "var(--col-text-muted)" }}>Select a school.</p>
        ) : (
          <>
            <h2>{detail.org.name}</h2>
            <p>{detail.org.city}, {detail.org.state}</p>
            <p><span className={`badge status-${detail.org.status}`}>{detail.org.status}</span></p>
            <div className="field">
              <label>Email</label>
              <div>{detail.org.email ?? "—"}</div>
            </div>
            <div className="field">
              <label>Website</label>
              <div>{detail.org.website ? <a href={detail.org.website} target="_blank" rel="noreferrer">{detail.org.website}</a> : "—"}</div>
            </div>
            <div className="field">
              <label>Research summary</label>
              <div>{detail.org.research_summary ?? "—"}</div>
            </div>
            <div className="field">
              <label>Hook</label>
              <div>{detail.org.research_hook ?? "—"}</div>
            </div>
            {detail.org.notes && (
              <div className="field">
                <label>Notes</label>
                <div>{detail.org.notes}</div>
              </div>
            )}
            <h3>Sources</h3>
            {detail.sources.map((s) => (
              <div key={s.url} className="field">
                <a href={s.url} target="_blank" rel="noreferrer">{s.title ?? s.url}</a>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="pane">
        {!detail ? null : (
          <>
            <h2>Draft</h2>
            {detail.draft?.is_fallback && (
              <p style={{ color: "var(--col-danger)" }}>
                Fallback draft — cannot be pushed to Gmail.
              </p>
            )}
            <div className="field">
              <label>Subject</label>
              <input value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)} />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea rows={16} value={bodyDraft} onChange={(e) => setBodyDraft(e.target.value)} />
            </div>
            <button onClick={pushToGmail} disabled={busy || detail.draft?.is_fallback}>
              Push to Gmail
            </button>{" "}
            <button className="secondary" onClick={regenerate} disabled={busy}>
              Regenerate
            </button>
            {message && <p>{message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
