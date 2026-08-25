import { Hono } from "hono";
import { getContracts } from "./db/index.ts";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "prm-finance" }));

app.get("/api/contracts", async (c) => {
  const contracts = await getContracts(c.env);
  return c.json({ contracts });
});

export default app;
