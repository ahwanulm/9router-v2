import { useState, useEffect } from "react";
import { getMachineId } from "@/shared/utils/machine";
import CLIToolsPageClient from "./CLIToolsPageClient";

export default function CLIToolsPage() {
  const [machineId, setMachineId] = useState("");

  useEffect(() => {
    getMachineId().then(setMachineId);
  }, []);

  if (!machineId) return null;

  return <CLIToolsPageClient machineId={machineId} />;
}
