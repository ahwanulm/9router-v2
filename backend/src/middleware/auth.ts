import { Request, Response, NextFunction } from "express";
import { verifyDashboardAuthToken } from "../lib/auth/dashboardSession.js";
import { getSettings, validateApiKey } from "../lib/localDb.js";
import { getConsistentMachineId } from "../shared/utils/machineId.js";

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";

let cachedCliToken: string | null = null;
async function getCliToken() {
  if (!cachedCliToken)
    cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  return cachedCliToken;
}

async function hasValidCliToken(req: Request) {
  const token = req.headers[CLI_TOKEN_HEADER] as string | undefined;
  if (!token) return false;
  return token === (await getCliToken());
}

// Public paths — no auth required
const PUBLIC_API_PATHS = [
  "/api/health",
  "/api/init",
  "/api/locale",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/version",
  "/api/settings/require-login",
  "/api/automation/ammail/webhook",
];

const PUBLIC_PREFIXES = ["/v1", "/v1beta", "/api/v1", "/api/v1beta"];

const ALWAYS_PROTECTED = [
  "/api/shutdown",
  "/api/settings/database",
  "/api/version/shutdown",
  "/api/version/update",
];

const PROTECTED_API_PATHS = [
  "/api/settings",
  "/api/keys",
  "/api/providers",
  "/api/provider-nodes",
  "/api/proxy-pools",
  "/api/combos",
  "/api/models",
  "/api/usage",
  "/api/oauth",
  "/api/media-providers",
  "/api/pricing",
  "/api/tags",
  "/api/tunnel",
  "/api/mcp",
  "/api/cli-tools",
  "/api/automation",
];

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const path = req.path;

  // Allow public paths
  if (PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(p + "/")))
    return next();
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p)))
    return next();

  // Allow CLI token
  if (await hasValidCliToken(req)) return next();

  const alwaysProtected = ALWAYS_PROTECTED.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  try {
    const settings = await getSettings();
    const requireLogin = settings?.requireLogin ?? false;

    // Check JWT cookie
    const token = req.cookies?.["9r_session"];
    if (token) {
      const valid = await verifyDashboardAuthToken(token);
      if (valid) return next();
    }

    // If login not required and path not always-protected
    if (!requireLogin && !alwaysProtected) {
      const isProtected = PROTECTED_API_PATHS.some(
        (p) => path === p || path.startsWith(p + "/")
      );
      if (!isProtected) return next();
    }

    // Check API key for LLM endpoints
    const apiKey = (req.headers["x-api-key"] ||
      req.headers["authorization"]?.replace("Bearer ", "")) as
      | string
      | undefined;
    if (apiKey) {
      const valid = await validateApiKey(apiKey);
      if (valid) return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
  } catch (err) {
    console.error("[auth]", err);
    return res.status(500).json({ error: "Auth error" });
  }
}
