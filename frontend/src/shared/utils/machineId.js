// Browser stub — machine ID is fetched from backend API
export async function getConsistentMachineId() {
  const res = await fetch("/api/health");
  const data = await res.json();
  return data.machineId ?? "browser";
}
export function machineIdSync() { return "browser"; }
