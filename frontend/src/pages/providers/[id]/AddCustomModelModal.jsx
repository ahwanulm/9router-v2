
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";

const KIND_LABELS = {
  llm:   { label: "LLM / Chat",    icon: "smart_toy",       color: "text-blue-400" },
  image: { label: "Image Generation", icon: "brush",         color: "text-purple-400" },
  video: { label: "Video Generation", icon: "movie",         color: "text-orange-400" },
};

export default function AddCustomModelModal({
  isOpen,
  providerAlias,
  providerDisplayAlias,
  allowedKinds,
  onSave,
  onClose,
}) {
  const kinds = allowedKinds?.length ? allowedKinds : ["llm"];
  const defaultKind = kinds.includes("llm") ? "llm" : kinds[0];

  const [modelId, setModelId]     = useState("");
  const [modelKind, setModelKind] = useState(defaultKind);
  const [testStatus, setTestStatus] = useState(null); // null | "testing" | "ok" | "error"
  const [testError, setTestError]   = useState("");
  const [saving, setSaving]         = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setModelId("");
      setTestStatus(null);
      setTestError("");
      setModelKind(defaultKind);
    }
  }, [isOpen, defaultKind]);

  const stripAlias = (id) => {
    const prefix = `${providerAlias}/`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
  };

  const handleTest = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId) return;
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${cleanId}` }),
      });
      const data = await res.json();
      setTestStatus(data.ok ? "ok" : "error");
      setTestError(data.error || "");
    } catch (err) {
      setTestStatus("error");
      setTestError(err.message);
    }
  };

  const handleSave = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId || saving) return;
    setSaving(true);
    try {
      await onSave(cleanId, modelKind);
    } finally {
      setSaving(false);
    }
  };

  const multipleKinds = kinds.length > 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Custom Model">
      <div className="flex flex-col gap-4">

        {/* Kind selector — only shown if provider supports multiple kinds */}
        {multipleKinds && (
          <div>
            <label className="text-sm font-medium mb-2 block">Model Type</label>
            <div className="flex gap-2">
              {kinds.map((k) => {
                const meta = KIND_LABELS[k] || { label: k, icon: "category", color: "text-text-muted" };
                const active = modelKind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setModelKind(k)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-sidebar text-text-muted hover:border-primary/40 hover:text-primary"
                    }`}
                  >
                    <span className={`material-symbols-outlined text-sm ${active ? "text-primary" : meta.color}`}>
                      {meta.icon}
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Model ID input */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Model ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); setTestStatus(null); setTestError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleTest()}
              placeholder={
                modelKind === "image" ? "e.g. leo-seedream" :
                modelKind === "video" ? "e.g. leo-kling-3" :
                "e.g. claude-opus-4-5"
              }
              className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              autoFocus
            />
            {modelKind === "llm" && (
              <Button
                variant="secondary"
                icon="science"
                loading={testStatus === "testing"}
                onClick={handleTest}
                disabled={!modelId.trim() || testStatus === "testing"}
              >
                {testStatus === "testing" ? "Testing..." : "Test"}
              </Button>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Will be registered as:{" "}
            <code className="font-mono bg-sidebar px-1 rounded">
              {providerDisplayAlias}/{stripAlias(modelId.trim()) || "model-id"}
            </code>
          </p>
        </div>

        {/* Test result */}
        {testStatus === "ok" && (
          <div className="flex items-center gap-2 text-sm text-green-500">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Model is reachable
          </div>
        )}
        {testStatus === "error" && (
          <div className="flex items-start gap-2 text-sm text-red-500">
            <span className="material-symbols-outlined text-base shrink-0">cancel</span>
            <span>{testError || "Model not reachable"}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={onClose} variant="ghost" fullWidth size="sm">Cancel</Button>
          <Button
            onClick={handleSave}
            fullWidth
            size="sm"
            disabled={!modelId.trim() || saving}
          >
            {saving ? "Adding..." : "Add Model"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

AddCustomModelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  allowedKinds: PropTypes.arrayOf(PropTypes.string),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
