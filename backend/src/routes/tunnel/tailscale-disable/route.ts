
import { disableTailscale } from "../../../lib/tunnel/index.js";

export async function POST(req: any, res: any) {
  try {
    const result = await disableTailscale();
    return res.json(result);
  } catch (error) {
    console.error("Tailscale disable error:", error);
    return res.status(500).json({ error: error.message });
  }
}
