import { useState, useEffect } from "react";
import { getMachineId } from "@/shared/utils/machine";
import EndpointPageClient from "./endpoint/EndpointPageClient";

export default function DashboardPage() {
  const [machineId, setMachineId] = useState("");

  useEffect(() => {
    getMachineId().then(setMachineId);
  }, []);

  if (!machineId) return null;

  return <EndpointPageClient machineId={machineId} />;
}
