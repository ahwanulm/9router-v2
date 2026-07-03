
import { useState, useEffect, useCallback } from "react";

// ── Copy button helper ──────────────────────────────────────────────────────
function CopyBtn({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={copy}
      disabled={!value}
      title={value ? value.slice(0, 60) + (value.length > 60 ? "…" : "") : "Tidak tersedia"}
      style={{
        padding: "2px 10px",
        fontSize: 11,
        borderRadius: 4,
        border: "1px solid",
        cursor: value ? "pointer" : "not-allowed",
        borderColor: copied ? "#22c55e" : value ? "#6366f1" : "#374151",
        background: copied ? "#166534" : value ? "#1e1b4b" : "#111827",
        color: copied ? "#86efac" : value ? "#a5b4fc" : "#4b5563",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
        minWidth: 60,
      }}
    >
      {copied ? "✓ Copied!" : label}
    </button>
  );
}

// ── Token masked display ────────────────────────────────────────────────────
function TokenCell({ value, maxLen = 22 }) {
  const [show, setShow] = useState(false);
  if (!value) return <span style={{ color: "#6b7280", fontSize: 12 }}>—</span>;
  const display = show ? value : value.slice(0, maxLen) + "…";
  return (
    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#d1d5db" }}>
      {display}
      <button
        onClick={() => setShow((s) => !s)}
        style={{ marginLeft: 4, fontSize: 10, color: "#6366f1", background: "none", border: "none", cursor: "pointer" }}
      >
        {show ? "hide" : "show"}
      </button>
    </span>
  );
}

// ── Export as JSON ──────────────────────────────────────────────────────────
function exportJson(pool) {
  const data = pool.map((a) => ({
    email: a.email,
    firebase_refresh_token: a.firebaseRefreshToken,
    firebase_api_key: a.firebaseApiKey,
    jwt: a.jwt,
    jwt_expires_at: a.jwtExpiresAt,
    balance: a.balance,
  }));
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weavy-tokens-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportRefreshTokensCsv(pool) {
  const has = pool.filter((a) => a.firebaseRefreshToken && a.firebaseApiKey);
  const csv = "email,firebase_refresh_token,firebase_api_key\n" +
    has.map((a) => `${a.email},${a.firebaseRefreshToken},${a.firebaseApiKey}`).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = `weavy-refresh-tokens-${Date.now()}.csv`;
  el.click();
  URL.revokeObjectURL(url);
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function WeavyPoolPage() {
  const [pool, setPool] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | hasToken | noToken | validJwt

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/providers/weavy/pool");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setPool(data.pool || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = pool.filter((a) => {
    const matchSearch = !search ||
      a.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ? true :
      filter === "hasToken" ? !!a.firebaseRefreshToken :
      filter === "noToken" ? !a.firebaseRefreshToken :
      filter === "validJwt" ? a.jwtValid : true;
    return matchSearch && matchFilter;
  });

  const cardStyle = {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 8,
  };

  const statBox = (label, value, color = "#6366f1") => (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: "12px 20px", border: "1px solid #1f2937", textAlign: "center", minWidth: 100 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e5e7eb", padding: "24px 32px", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f9fafb" }}>
            🪄 Weavy Token Pool
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            Copy firebase_refresh_token + firebase_api_key ke kliperspro atau sistem lain
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ padding: "6px 14px", borderRadius: 6, background: "#1f2937", border: "1px solid #374151", color: "#d1d5db", cursor: "pointer", fontSize: 13 }}>
            ↻ Refresh
          </button>
          <button onClick={() => exportRefreshTokensCsv(pool)} style={{ padding: "6px 14px", borderRadius: 6, background: "#1e1b4b", border: "1px solid #4338ca", color: "#a5b4fc", cursor: "pointer", fontSize: 13 }}>
            ⬇ Export CSV
          </button>
          <button onClick={() => exportJson(pool)} style={{ padding: "6px 14px", borderRadius: 6, background: "#14532d", border: "1px solid #166534", color: "#86efac", cursor: "pointer", fontSize: 13 }}>
            ⬇ Export JSON
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {statBox("Total Akun", stats.total, "#e5e7eb")}
          {statBox("Aktif", stats.active, "#22c55e")}
          {statBox("JWT Valid", stats.jwtValid, "#6366f1")}
          {statBox("Punya Refresh Token", stats.hasRefreshToken, "#f59e0b")}
        </div>
      )}

      {/* Info box */}
      {stats && stats.hasRefreshToken === 0 && (
        <div style={{ background: "#431407", border: "1px solid #7c2d12", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#fed7aa" }}>
          ⚠️ <strong>firebase_refresh_token masih kosong</strong> untuk semua akun. 
          Jalankan ulang signup untuk akun-akun ini agar refresh token tertangkap dari IndexedDB.
        </div>
      )}

      {/* Firebase usage guide */}
      <div style={{ background: "#0c1a2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 12 }}>
        <strong style={{ color: "#60a5fa" }}>📋 Cara pakai di kliperspro (production):</strong>
        <pre style={{ margin: "8px 0 0", color: "#93c5fd", fontSize: 11, overflow: "auto" }}>{`POST https://securetoken.googleapis.com/v1/token?key=<firebase_api_key>
Body: grant_type=refresh_token&refresh_token=<firebase_refresh_token>
→ Response: { id_token: "<JWT baru>", refresh_token: "<update ini>" }
→ Gunakan id_token sebagai: Authorization: Bearer <JWT>`}</pre>
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari email…"
          style={{ flex: 1, minWidth: 200, background: "#111827", border: "1px solid #374151", borderRadius: 6, padding: "6px 12px", color: "#e5e7eb", fontSize: 13 }}
        />
        {["all", "hasToken", "noToken", "validJwt"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              border: "1px solid",
              borderColor: filter === f ? "#6366f1" : "#374151",
              background: filter === f ? "#1e1b4b" : "#111827",
              color: filter === f ? "#a5b4fc" : "#9ca3af",
            }}
          >
            {{ all: "Semua", hasToken: "✅ Punya Token", noToken: "❌ Tanpa Token", validJwt: "🔑 JWT Valid" }[f]}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>Memuat…</div>
      ) : error ? (
        <div style={{ color: "#f87171", padding: 20 }}>Error: {error}</div>
      ) : (
        <div>
          <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
            Menampilkan {filtered.length} dari {pool.length} akun
          </div>
          {filtered.map((acc) => (
            <div key={acc.id} style={{ ...cardStyle, opacity: acc.isActive ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* Email */}
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 220, color: acc.isActive ? "#f9fafb" : "#6b7280" }}>
                  {acc.email}
                </span>

                {/* JWT status badge */}
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                  background: acc.jwtValid ? "#14532d" : "#7f1d1d",
                  color: acc.jwtValid ? "#86efac" : "#fca5a5",
                }}>
                  {acc.jwtValid ? `JWT valid ${Math.ceil(acc.jwtSecondsLeft / 60)}m` : "JWT expired"}
                </span>

                {/* Refresh token badge */}
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                  background: acc.firebaseRefreshToken ? "#1c1917" : "#1f2937",
                  color: acc.firebaseRefreshToken ? "#fbbf24" : "#4b5563",
                }}>
                  {acc.firebaseRefreshToken ? "🔑 refresh_token ✓" : "❌ no refresh_token"}
                </span>

                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  💰 {acc.balance} credits
                </span>

                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <CopyBtn value={acc.firebaseRefreshToken} label="Copy refresh_token" />
                  <CopyBtn value={acc.firebaseApiKey} label="Copy api_key" />
                  <CopyBtn value={acc.jwt} label="Copy JWT" />
                  <CopyBtn
                    value={acc.firebaseRefreshToken && acc.firebaseApiKey
                      ? JSON.stringify({ email: acc.email, firebase_refresh_token: acc.firebaseRefreshToken, firebase_api_key: acc.firebaseApiKey }, null, 2)
                      : ""}
                    label="Copy All"
                  />
                </div>
              </div>

              {/* Token previews */}
              <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>refresh_token: </span>
                  <TokenCell value={acc.firebaseRefreshToken} />
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>api_key: </span>
                  <TokenCell value={acc.firebaseApiKey} maxLen={16} />
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>JWT: </span>
                  <TokenCell value={acc.jwt} />
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>Tidak ada akun ditemukan</div>
          )}
        </div>
      )}
    </div>
  );
}
