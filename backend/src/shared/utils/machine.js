import { getConsistentMachineId } from "./machineId.js";

// Get machine ID using node-machine-id with salt
export async function getMachineId() {
  return await getConsistentMachineId();
}
