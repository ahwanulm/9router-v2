
import { useState, useEffect } from "react";
import { Card, Button, Badge, Toggle, Loading } from "@/shared/components";

// Known capability auto-suggest patterns for video models
const VIDEO_PATTERNS = [
  { pattern: /kling.*o3|kling-o3/, caps: { startFrame: true, endFrame: false, imageReference: true, videoReference: true, defaultImageReferenceStrength: "MID", durations: [5, 10], defaultDuration: 5, defaultResolution: "1080p", defaultAspectRatio: "16:9" }, label: "Kling O3" },
  { pattern: /kling.*3\./, caps: { startFrame: true, endFrame: false, durations: [5, 10, 12], defaultDuration: 10, defaultResolution: "720p", defaultAspectRatio: "16:9" }, label: "Kling 3.x" },
  { pattern: /kling/, caps: { startFrame: true, endFrame: false, durations: [5, 10], defaultDuration: 5, defaultResolution: "1080p", defaultAspectRatio: "16:9" }, label: "Kling 2.x" },
  { pattern: /seedance.*lite/, caps: { startFrame: true, endFrame: false, durations: [4, 8], defaultDuration: 4, defaultResolution: "480p", defaultAspectRatio: "16:9" }, label: "Seedance Lite" },
  { pattern: /seedance/, caps: { startFrame: true, endFrame: true, durations: [4, 8, 10], defaultDuration: 8, defaultResolution: "720p", defaultAspectRatio: "16:9" }, label: "Seedance" },
  { pattern: /veo-3\.1|veo.*3\.1/, caps: { startFrame: true, endFrame: false, durations: [4, 6, 8], defaultDuration: 8, defaultResolution: "720p", defaultAspectRatio: "16:9" }, label: "Veo 3.1" },
  { pattern: /veo/, caps: { startFrame: true, endFrame: false, durations: [8], defaultDuration: 8, defaultResolution: "720p", defaultAspectRatio: "16:9" }, label: "Veo 3" },
  { pattern: /sora/, caps: { startFrame: false, endFrame: false, durations: [4, 8, 12], defaultDuration: 8, defaultResolution: "720p", defaultAspectRatio: "16:9" }, label: "Sora" },
  { pattern: /hailuo/, caps: { startFrame: true, endFrame: false, durations: [6, 10], defaultDuration: 6, defaultResolution: "768p", defaultAspectRatio: "16:9" }, label: "Hailuo" },
  { pattern: /ltx/, caps: { startFrame: true, endFrame: true, durations: [6, 8, 10], defaultDuration: 6, defaultResolution: "1080p", defaultAspectRatio: "16:9" }, label: "LTX" },
  { pattern: /motion/, caps: { startFrame: true, endFrame: false, durations: [5], defaultDuration: 5, defaultResolution: "720p", defaultAspectRatio: "16:9" }, label: "Motion" },
];

const IMAGE_PATTERNS = [
  { pattern: /seedream.*4\.5/, caps: { apiVersion: "v2", resolutionTiers: { SMALL: null, MEDIUM: { base: 2048 }, LARGE: { base: 4096 } }, defaultTier: "MEDIUM", imageReference: true, refMethod: "guidances", maxRefs: 6, strengthSupported: true, defaultStrength: "MID", supportsStyleIds: true }, label: "Seedream 4.5" },
  { pattern: /seedream/, caps: { apiVersion: "v2", resolutionTiers: { SMALL: { base: 1024 }, MEDIUM: { base: 2048 }, LARGE: { base: 4096 } }, defaultTier: "MEDIUM", imageReference: true, refMethod: "guidances", maxRefs: 6, strengthSupported: true, defaultStrength: "MID", supportsStyleIds: true }, label: "Seedream" },
  { pattern: /flux-dev/, caps: { apiVersion: "v1", resolutionTiers: { SMALL: null, MEDIUM: null, LARGE: null }, defaultTier: null, imageReference: true, refMethod: "controlnets", maxRefs: 1, strengthSupported: true, defaultStrength: "MID", preprocessorId: 233 }, label: "Flux Dev" },
  { pattern: /flux/, caps: { apiVersion: "v2", resolutionTiers: { SMALL: null, MEDIUM: { base: 1024 }, LARGE: null }, defaultTier: "MEDIUM", imageReference: true, refMethod: "guidances", maxRefs: 4, strengthSupported: true, defaultStrength: "MID" }, label: "Flux" },
  { pattern: /phoenix/, caps: { apiVersion: "v1", resolutionTiers: { SMALL: null, MEDIUM: null, LARGE: null }, defaultTier: null, imageReference: true, refMethod: "controlnets", maxRefs: 1, strengthSupported: true, defaultStrength: "MID", preprocessorId: 364, supportsContrast: true, supportsUltra: true }, label: "Phoenix" },
  { pattern: /ideogram/, caps: { apiVersion: "v2", resolutionTiers: { SMALL: null, MEDIUM: { base: 1024 }, LARGE: null }, defaultTier: "MEDIUM", qualityOptions: ["TURBO", "BALANCED", "QUALITY"], defaultQuality: "BALANCED", imageReference: true, refMethod: "guidances", maxRefs: 6, strengthSupported: true, defaultStrength: "MID" }, label: "Ideogram" },
  { pattern: /gpt.image/, caps: { apiVersion: "v2", resolutionTiers: { SMALL: { base: 1024 }, MEDIUM: { base: 2048 }, LARGE: { base: 2880 } }, defaultTier: "MEDIUM", qualityOptions: ["LOW", "MEDIUM", "HIGH"], defaultQuality: "MEDIUM", imageReference: true, refMethod: "guidances", maxRefs: 6, strengthSupported: false }, label: "GPT Image" },
  { pattern: /recraft/, caps: { apiVersion: "v2", resolutionTiers: { SMALL: null, MEDIUM: { base: 2048 }, LARGE: null }, defaultTier: "MEDIUM", imageReference: true, refMethod: "guidances", maxRefs: 6, strengthSupported: true, defaultStrength: "MID" }, label: "Recraft" },
];

function suggestCaps(type, id, name, apiName) {
  const hay = [id, name, apiName].filter(Boolean).join(" ").toLowerCase();
  const patterns = type === "video" ? VIDEO_PATTERNS : IMAGE_PATTERNS;
  for (const p of patterns) {
    if (p.pattern.test(hay)) return p;
  }
  return null;
}

const ALL_DURATIONS = [4, 5, 6, 8, 10, 12, 15, 20];
const ALL_RESOLUTIONS = ["Auto", "480p", "720p", "768p", "1080p", "4K"];
const ALL_ASPECT_RATIOS = ["auto", "16:9", "9:16", "1:1", "4:3"];
const TIER_KEYS = ["SMALL", "MEDIUM", "LARGE"];

const DEFAULT_NEW_MODEL = {
  id: "", name: "", uuid: "", type: "image",
  apiModelName: "", quality: "", isPublic: true, promptEnhance: "OFF",
  dimensions: {},
  capabilities: {
    apiVersion: "v2",
    resolutionTiers: { SMALL: null, MEDIUM: { base: 1024 }, LARGE: null },
    defaultTier: "MEDIUM",
    qualityOptions: null, defaultQuality: null,
    imageReference: true, refMethod: "guidances",
    maxRefs: 6, strengthSupported: true, defaultStrength: "MID",
    supportsStyleIds: false, supportsContrast: false, supportsUltra: false,
    preprocessorId: null,
    // video fields
    startFrame: false, endFrame: false,
    videoReference: false,
    defaultImageReferenceStrength: "MID",
    durations: [5, 10], defaultDuration: 5,
    defaultResolution: "720p", defaultAspectRatio: "16:9",
  },
};

function LeonardoAdminPanel() {
  const [subTab, setSubTab] = useState("models"); // models | cookies | config
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modelFilter, setModelFilter] = useState("all"); // all | image | video
  const [modelSearch, setModelSearch] = useState("");
  const [editingModel, setEditingModel] = useState(null); // model being edited in modal
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState(JSON.parse(JSON.stringify(DEFAULT_NEW_MODEL)));
  const [capsTouched, setCapsTouched] = useState(false);

  // Cookie pool state
  const [connections, setConnections] = useState([]);
  const [cookieProvider, setCookieProvider] = useState("leonardo");
  const [cookieLabel, setCookieLabel] = useState("");
  const [cookieValue, setCookieValue] = useState("");
  const [addingCookie, setAddingCookie] = useState(false);
  const [cookieStatus, setCookieStatus] = useState("");

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/automation/leonardo");
      const data = await res.json();
      if (data.ok) setConfig(data.config);
    } catch (e) {
      flash("error", "Gagal memuat config: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadConnections = async () => {
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      if (res.ok) setConnections(data.connections || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadConfig(); loadConnections(); }, []);

  // Auto-suggest capabilities when typing
  useEffect(() => {
    if (capsTouched || !newModel.id) return;
    const s = suggestCaps(newModel.type, newModel.id, newModel.name, newModel.apiModelName);
    if (!s) return;
    setNewModel(prev => ({
      ...prev,
      capabilities: { ...prev.capabilities, ...s.caps },
    }));
  }, [newModel.id, newModel.name, newModel.apiModelName, newModel.type, capsTouched]);

  const apiPost = async (action, extra = {}) => {
    const res = await fetch("/api/automation/leonardo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    return res.json();
  };

  const handleImportDefaults = async () => {
    setSaving(true);
    try {
      const data = await apiPost("import-defaults");
      if (data.ok) {
        flash("success", `✓ ${data.added} model diimport (${data.imageAdded} image, ${data.videoAdded} video)`);
        await loadConfig();
      } else flash("error", data.error);
    } finally { setSaving(false); }
  };

  const handleDeleteAllModels = async () => {
    if (!confirm("Hapus SEMUA model dari config? Tindakan ini tidak bisa di-undo.")) return;
    setSaving(true);
    try {
      const data = await apiPost("delete-all-models");
      if (data.ok) { flash("success", `${data.deleted} model dihapus`); await loadConfig(); }
      else flash("error", data.error);
    } finally { setSaving(false); }
  };

  const handleDeleteModel = async (id) => {
    if (!confirm(`Hapus model "${id}"?`)) return;
    const data = await apiPost("delete-model", { id });
    if (data.ok) { flash("success", `Model "${id}" dihapus`); await loadConfig(); }
    else flash("error", data.error);
  };

  const handleAddModel = async () => {
    const m = { ...newModel };
    if (!m.id?.trim() || !m.name?.trim()) return flash("error", "Model ID dan Name wajib diisi");
    if (!m.id.startsWith("leo-")) m.id = `leo-${m.id}`;
    setSaving(true);
    try {
      const data = await apiPost("add-model", { model: m });
      if (data.ok) {
        flash("success", `Model "${m.id}" berhasil ditambahkan`);
        setNewModel(JSON.parse(JSON.stringify(DEFAULT_NEW_MODEL)));
        setCapsTouched(false);
        setShowAddForm(false);
        await loadConfig();
      } else flash("error", data.error);
    } finally { setSaving(false); }
  };

  const handleUpdateModel = async (id, updates) => {
    const data = await apiPost("update-model", { id, model: updates });
    if (data.ok) { flash("success", "Model diperbarui"); setEditingModel(null); await loadConfig(); }
    else flash("error", data.error);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { failThreshold, coolingMinutes, autoDisableThreshold, imageTimeoutMs, videoTimeoutMs } = config;
      const data = await apiPost("save-settings", { failThreshold, coolingMinutes, autoDisableThreshold, imageTimeoutMs, videoTimeoutMs });
      if (data.ok) flash("success", "Settings disimpan");
      else flash("error", data.error);
    } finally { setSaving(false); }
  };

  // Cookie pool handlers
  const handleAddCookie = async (e) => {
    e.preventDefault();
    if (!cookieLabel.trim() || !cookieValue.trim()) return alert("Label dan Cookie wajib diisi");
    setAddingCookie(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: cookieProvider, apiKey: cookieValue.trim(), name: cookieLabel.trim(), email: cookieLabel.trim(), priority: 1 }),
      });
      const data = await res.json();
      if (res.ok) { setCookieLabel(""); setCookieValue(""); setCookieStatus("Cookie ditambahkan!"); await loadConnections(); setTimeout(() => setCookieStatus(""), 3000); }
      else alert(data.error || "Gagal menambahkan");
    } finally { setAddingCookie(false); }
  };

  const handleDeleteConn = async (id) => {
    if (!confirm("Hapus connection ini?")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    await loadConnections();
  };

  const handleToggleConn = async (conn) => {
    await fetch(`/api/providers/${conn.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !conn.isActive }) });
    await loadConnections();
  };

  const handleTestConn = async (id) => {
    setCookieStatus("Testing...");
    const res = await fetch(`/api/providers/${id}/test`, { method: "POST" });
    const data = await res.json();
    setCookieStatus(data.valid ? "✓ Valid" : `⚠ ${data.error || "Test gagal"}`);
    await loadConnections();
    setTimeout(() => setCookieStatus(""), 5000);
  };

  const filteredConns = connections.filter(c => c.provider === cookieProvider);
  const filteredModels = (config?.models || []).filter(m => {
    if (modelFilter !== "all" && m.type !== modelFilter) return false;
    if (modelSearch) {
      const hay = [m.id, m.name, m.apiModelName].join(" ").toLowerCase();
      if (!hay.includes(modelSearch.toLowerCase())) return false;
    }
    return true;
  });
  const imageModels = filteredModels.filter(m => m.type === "image");
  const videoModels = filteredModels.filter(m => m.type === "video");

  const subTabBtn = (id, icon, label) => (
    <button
      onClick={() => setSubTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        subTab === id ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text-main hover:bg-surface"
      }`}
    >
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
      {label}
    </button>
  );

  if (loading) return <Card><div className="flex justify-center py-12"><Loading /></div></Card>;

  return (
    <Card>
    <div className="space-y-5">
      {/* Section Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <img src="/providers/leonardo.png" alt="Leonardo" className="size-5 rounded object-contain" />
          Leonardo Admin
        </h2>
      </div>
      {/* Flash message */}
      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${
          msg.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
        }`}>
          <span className="material-symbols-outlined text-base">{msg.type === "success" ? "check_circle" : "cancel"}</span>
          {msg.text}
        </div>
      )}

      {/* Sub-tab header */}
      <div className="flex items-center gap-2">
        {subTabBtn("models", "category", `Models (${config?.models?.length || 0})`)}
        {subTabBtn("cookies", "cookie", `Cookies (${filteredConns.length})`)}
        {subTabBtn("config", "tune", "Settings")}
      </div>

      {/* ══ MODELS SUB-TAB ══ */}
      {subTab === "models" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <Card padding="sm">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search models..."
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                className="flex-1 min-w-[180px] text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              />
              <select
                value={modelFilter}
                onChange={e => setModelFilter(e.target.value)}
                className="text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              >
                <option value="all">All Types</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
              <Button size="sm" variant="secondary" icon="download" onClick={handleImportDefaults} disabled={saving}>Import Defaults</Button>
              <Button size="sm" variant="primary" icon="add" onClick={() => { setShowAddForm(v => !v); setCapsTouched(false); }}>Add Model</Button>
              <Button size="sm" variant="danger" icon="delete_sweep" onClick={handleDeleteAllModels} disabled={saving}>Delete All</Button>
            </div>
          </Card>

          {/* Add Model Form */}
          {showAddForm && (
            <Card padding="md" className="border border-primary/30">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary">add_circle</span>
                Add New Model
              </h3>
              <ModelForm
                model={newModel}
                onChange={(field, val) => {
                  setNewModel(prev => field.includes(".") ? updateNested(prev, field, val) : { ...prev, [field]: val });
                }}
                onCapsTouched={() => setCapsTouched(true)}
              />
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={handleAddModel} disabled={saving}>
                  {saving ? "Saving..." : "+ Add Model"}
                </Button>
              </div>
            </Card>
          )}

          {/* Model list — grouped by type, displayed as grid */}
          {[{label: "Image Generation", icon: "brush", list: imageModels}, {label: "Video Generation", icon: "movie", list: videoModels}].map(group => (
            group.list.length > 0 && (
              <div key={group.label} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-text-muted">{group.icon}</span>
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider">{group.label}</span>
                  <span className="text-[10px] text-text-muted/60 bg-sidebar px-1.5 py-0.5 rounded-full">{group.list.length}</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {group.list.map(m => (
                    <div key={m.id} className="group relative rounded-xl border border-border bg-card hover:border-primary/30 transition-all p-3 flex flex-col gap-2">
                      {/* Top row: name + actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-bold text-text-main truncate" title={m.id}>{m.id}</p>
                          <p className="text-[11px] text-text-muted truncate" title={m.name}>{m.name}</p>
                        </div>
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingModel(JSON.parse(JSON.stringify(m)))}
                            className="p-1 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                            title="Edit model"
                          >
                            <span className="material-symbols-outlined text-[15px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteModel(m.id)}
                            className="p-1 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                            title="Delete model"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        </div>
                      </div>
                      {/* API model name */}
                      {m.apiModelName && (
                        <p className="text-[10px] font-mono bg-sidebar px-2 py-0.5 rounded text-text-muted truncate" title={m.apiModelName}>{m.apiModelName}</p>
                      )}
                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1.5 mt-auto">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          m.capabilities?.apiVersion === "v1" ? "bg-orange-500/10 text-orange-400" : "bg-blue-500/10 text-blue-400"
                        }`}>{m.type === "image" ? (m.capabilities?.apiVersion || "v2") : "video"}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          m.isPublic ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                        }`}>{m.isPublic ? "public" : "hidden"}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar text-text-muted">✨ {m.promptEnhance || "OFF"}</span>
                        {m.type === "video" && m.capabilities?.durations && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar text-text-muted">{m.capabilities.durations.join("/")}s</span>
                        )}
                        {m.type === "video" && m.capabilities?.defaultResolution && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar text-text-muted">{m.capabilities.defaultResolution}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {filteredModels.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8">
              <p className="text-center text-text-muted text-sm">
                {config?.models?.length === 0
                  ? 'Belum ada model. Klik "Import Defaults" untuk mengisi dari providerModels.js.'
                  : "Tidak ada model yang cocok dengan filter."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══ COOKIES SUB-TAB ══ */}
      {subTab === "cookies" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-4">
            <Card padding="md" className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">filter_list</span>
                Filter Provider
              </h3>
              <div className="flex items-center gap-2">
                <img src={`/providers/${cookieProvider}.png`} alt={cookieProvider} className="size-5 rounded object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                <select
                  value={cookieProvider}
                  onChange={e => setCookieProvider(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                >
                  <option value="leonardo">Leonardo AI</option>
                  <option value="grok-web">Grok Web</option>
                  <option value="perplexity-web">Perplexity Web</option>
                </select>
              </div>
              <p className="text-xs text-text-muted">{filteredConns.length} connections untuk {cookieProvider}</p>
            </Card>

            <Card padding="md" className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Add Cookie
              </h3>
              <form onSubmit={handleAddCookie} className="space-y-2.5">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">Label / Email</label>
                  <input
                    type="text" placeholder="account@gmail.com"
                    value={cookieLabel} onChange={e => setCookieLabel(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">Cookie Value</label>
                  <textarea
                    placeholder="Paste cookie string..."
                    value={cookieValue} onChange={e => setCookieValue(e.target.value)}
                    rows={4}
                    className="w-full text-xs font-mono px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary resize-y"
                    required
                  />
                </div>
                <Button type="submit" variant="primary" size="sm" fullWidth disabled={addingCookie}>
                  {addingCookie ? "Adding..." : "Add Cookie Connection"}
                </Button>
              </form>
              {cookieStatus && <p className="text-xs text-primary italic">{cookieStatus}</p>}
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card padding="md" className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">list_alt</span>
                Cookie Pool — {cookieProvider}
              </h3>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-sidebar text-text-muted border-b border-border font-semibold">
                      <th className="px-3 py-2.5">Label</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Balance</th>
                      <th className="px-3 py-2.5">Fails</th>
                      <th className="px-3 py-2.5">Active</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConns.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-text-muted">Tidak ada cookie untuk provider ini</td></tr>
                    ) : filteredConns.map(conn => (
                      <tr key={conn.id} className="border-b border-border hover:bg-surface/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-text-main">{conn.name || conn.email || "—"}</div>
                          <div className="text-[10px] text-text-muted font-mono">{conn.id?.slice(0, 8)}...</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={conn.testStatus === "active" || conn.testStatus === "ok" ? "success" : conn.testStatus === "error" ? "danger" : "secondary"}>
                            {conn.testStatus || "unknown"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-text-main font-semibold">
                          {conn.last_balance !== undefined && conn.last_balance !== null ? `${conn.last_balance} tok` : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={conn.fail_count > 0 ? "text-red-400" : "text-text-muted"}>{conn.fail_count || 0}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Toggle checked={conn.isActive} onChange={() => handleToggleConn(conn)} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex gap-1.5 justify-end">
                            <Button size="xs" variant="secondary" onClick={() => handleTestConn(conn.id)}>Test</Button>
                            <Button size="xs" variant="danger" onClick={() => handleDeleteConn(conn.id)}>Del</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ══ CONFIG SUB-TAB ══ */}
      {subTab === "config" && config && (
        <Card padding="md" className="space-y-4 max-w-xl">
          <h3 className="text-sm font-bold">Global Settings</h3>
          {[
            { key: "failThreshold", label: "Fail Threshold", help: "Berapa kali gagal sebelum masuk cooling" },
            { key: "coolingMinutes", label: "Cooling (menit)", help: "Durasi cooling period setelah fail threshold" },
            { key: "autoDisableThreshold", label: "Auto-disable Threshold", help: "Total failures sebelum cookie dinonaktifkan" },
            { key: "imageTimeoutMs", label: "Image Timeout (ms)", help: "Timeout generasi image" },
            { key: "videoTimeoutMs", label: "Video Timeout (ms)", help: "Timeout generasi video" },
          ].map(({ key, label, help }) => (
            <div key={key}>
              <label className="text-xs font-semibold block mb-1">{label}</label>
              <input
                type="number"
                value={config[key] || 0}
                onChange={e => setConfig(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              />
              <p className="text-[11px] text-text-muted mt-0.5">{help}</p>
            </div>
          ))}
          <Button variant="primary" size="sm" onClick={handleSaveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </Card>
      )}

      {/* Edit Model Modal */}
      {editingModel && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setEditingModel(null)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Edit Model — {editingModel.id}</h3>
              <button onClick={() => setEditingModel(null)} className="text-text-muted hover:text-text-main">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <ModelForm
              model={editingModel}
              onChange={(field, val) => {
                setEditingModel(prev => field.includes(".") ? updateNested(prev, field, val) : { ...prev, [field]: val });
              }}
              onCapsTouched={() => {}}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingModel(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => handleUpdateModel(editingModel.id, editingModel)} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </Card>
  );
}

// Deep update helper for nested fields like "capabilities.startFrame"
function updateNested(obj, path, val) {
  const parts = path.split(".");
  const result = { ...obj };
  let cur = result;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = { ...cur[parts[i]] };
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
  return result;
}

// Shared model form for both Add and Edit
function ModelForm({ model, onChange, onCapsTouched }) {
  const isVideo = model.type === "video";
  const caps = model.capabilities || {};

  const field = (label, key, input) => (
    <div key={key}>
      <label className="text-[11px] font-semibold text-text-muted block mb-1">{label}</label>
      {input}
    </div>
  );

  const textInput = (key, placeholder = "") => (
    <input
      type="text" value={model[key] || ""} placeholder={placeholder}
      onChange={e => onChange(key, e.target.value)}
      className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
    />
  );

  const capToggle = (capKey, label) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox" checked={!!caps[capKey]}
        onChange={e => { onCapsTouched(); onChange(`capabilities.${capKey}`, e.target.checked); }}
        className="w-3.5 h-3.5 accent-primary"
      />
      <span className="text-xs text-text-muted">{label}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        {field("Model ID (tanpa prefix leo-)", "id", textInput("id", "e.g. kling-3"))}
        {field("Display Name", "name", textInput("name", "e.g. Kling 3.0"))}
        {field("UUID (kosong untuk native v2)", "uuid", textInput("uuid", "xxxxxxxx-xxxx-xxxx..."))}
        {field("API Model Name", "apiModelName", textInput("apiModelName", "e.g. kling-3.0"))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {field("Type", "type",
          <select value={model.type || "image"} onChange={e => onChange("type", e.target.value)}
            className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        )}
        {field("Prompt Enhance", "promptEnhance",
          <select value={model.promptEnhance || "OFF"} onChange={e => onChange("promptEnhance", e.target.value)}
            className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
            <option value="AUTO">AUTO</option>
            <option value="ON">ON</option>
            <option value="OFF">OFF</option>
          </select>
        )}
        {field("Public", "isPublic",
          <div className="flex items-center gap-2 pt-1">
            <Toggle checked={!!model.isPublic} onChange={v => onChange("isPublic", v)} />
            <span className="text-xs text-text-muted">{model.isPublic ? "Visible to users" : "Hidden"}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
          {isVideo ? "Video Capabilities" : "Image Capabilities"}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {isVideo ? (
        /* Video-specific caps */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("Default Resolution", "capabilities.defaultResolution",
              <select value={caps.defaultResolution || "720p"}
                onChange={e => { onCapsTouched(); onChange("capabilities.defaultResolution", e.target.value); }}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
                {ALL_RESOLUTIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            )}
            {field("Default Aspect Ratio", "capabilities.defaultAspectRatio",
              <select value={caps.defaultAspectRatio || "16:9"}
                onChange={e => { onCapsTouched(); onChange("capabilities.defaultAspectRatio", e.target.value); }}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
                {ALL_ASPECT_RATIOS.map(r => <option key={r}>{r}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-text-muted block mb-2">Supported Durations (seconds)</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DURATIONS.map(d => (
                <label key={d} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(caps.durations || []).includes(d)}
                    onChange={e => {
                      onCapsTouched();
                      const cur = caps.durations || [];
                      const next = e.target.checked ? [...cur, d].sort((a,b)=>a-b) : cur.filter(x=>x!==d);
                      onChange("capabilities.durations", next);
                      if (!next.includes(caps.defaultDuration)) onChange("capabilities.defaultDuration", next[0]);
                    }}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                  <span className="text-xs">{d}s</span>
                </label>
              ))}
            </div>
          </div>

          {(caps.durations || []).length > 0 && field("Default Duration", "capabilities.defaultDuration",
            <select value={caps.defaultDuration || ""}
              onChange={e => { onCapsTouched(); onChange("capabilities.defaultDuration", Number(e.target.value)); }}
              className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
              {(caps.durations || []).map(d => <option key={d} value={d}>{d}s</option>)}
            </select>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            {capToggle("startFrame", "Start Frame (first image)")}
            {capToggle("endFrame", "End Frame (last image)")}
            {capToggle("imageReference", "Image Reference (img2vid)")}
            {capToggle("videoReference", "Video Reference")}
          </div>

          {caps.imageReference && field("Image Reference Strength", "capabilities.defaultImageReferenceStrength",
            <select value={caps.defaultImageReferenceStrength || "MID"}
              onChange={e => { onCapsTouched(); onChange("capabilities.defaultImageReferenceStrength", e.target.value); }}
              className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
              {["LOW","MID","HIGH"].map(s => <option key={s}>{s}</option>)}
            </select>
          )}
        </div>
      ) : (
        /* Image-specific caps */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("API Version", "capabilities.apiVersion",
              <select value={caps.apiVersion || "v2"}
                onChange={e => { onCapsTouched(); onChange("capabilities.apiVersion", e.target.value); }}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
                <option value="v2">v2 (native)</option>
                <option value="v1">v1 (legacy UUID)</option>
              </select>
            )}
            {field("Ref Method", "capabilities.refMethod",
              <select value={caps.refMethod || "guidances"}
                onChange={e => { onCapsTouched(); onChange("capabilities.refMethod", e.target.value); }}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
                <option value="guidances">guidances (v2)</option>
                <option value="controlnets">controlnets (v1)</option>
              </select>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-text-muted block mb-2">Resolution Tiers</label>
            <div className="space-y-2">
              {TIER_KEYS.map(tier => {
                const tierVal = caps.resolutionTiers?.[tier];
                const enabled = !!tierVal;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 w-20 cursor-pointer">
                      <input type="checkbox" checked={enabled}
                        onChange={e => {
                          onCapsTouched();
                          const cur = caps.resolutionTiers || {};
                          onChange("capabilities.resolutionTiers", { ...cur, [tier]: e.target.checked ? { base: 1024 } : null });
                        }}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      <span className="text-xs font-semibold">{tier}</span>
                    </label>
                    {enabled && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-text-muted">base px:</span>
                        <input
                          type="number" value={tierVal?.base || 1024} step={256}
                          onChange={e => {
                            onCapsTouched();
                            const cur = caps.resolutionTiers || {};
                            onChange("capabilities.resolutionTiers", { ...cur, [tier]: { base: Number(e.target.value) } });
                          }}
                          className="w-24 text-xs px-2 py-1 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("Default Tier", "capabilities.defaultTier",
              <select value={caps.defaultTier || "MEDIUM"}
                onChange={e => { onCapsTouched(); onChange("capabilities.defaultTier", e.target.value); }}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary">
                {TIER_KEYS.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
            {field("Max Refs", "capabilities.maxRefs",
              <input type="number" min={1} max={10} value={caps.maxRefs || 6}
                onChange={e => { onCapsTouched(); onChange("capabilities.maxRefs", Number(e.target.value)); }}
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              />
            )}
          </div>

          {field("Quality Options (comma-separated, kosong = none)", "capabilities.qualityOptions",
            <input type="text"
              value={(caps.qualityOptions || []).join(",")}
              placeholder="e.g. TURBO,BALANCED,QUALITY"
              onChange={e => {
                onCapsTouched();
                const arr = e.target.value ? e.target.value.split(",").map(s=>s.trim()).filter(Boolean) : null;
                onChange("capabilities.qualityOptions", arr);
              }}
              className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            />
          )}

          {field("Preprocessor ID (v1 only, kosong = none)", "capabilities.preprocessorId",
            <input type="number"
              value={caps.preprocessorId || ""}
              placeholder="e.g. 364"
              onChange={e => { onCapsTouched(); onChange("capabilities.preprocessorId", e.target.value ? Number(e.target.value) : null); }}
              className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            />
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {capToggle("imageReference", "Image Reference")}
            {capToggle("strengthSupported", "Strength Supported")}
            {capToggle("supportsStyleIds", "Supports Style IDs")}
            {capToggle("supportsContrast", "Supports Contrast (v1)")}
            {capToggle("supportsUltra", "Supports Ultra (v1)")}
          </div>
        </div>
      )}
    </div>
  );
}

export default LeonardoAdminPanel;
