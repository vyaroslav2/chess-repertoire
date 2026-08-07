import React from "react";
import RepertoireTester from "../components/RepertoireTester";
import { getDatabaseRepertoire } from "./actions";

export default async function Home() {
  const repertoireData = await getDatabaseRepertoire();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#161512", gap: "20px", padding: "20px" }}>
      <RepertoireTester database={repertoireData} />
    </div>
  );
}
