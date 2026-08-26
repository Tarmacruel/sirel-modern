import { anonymousProcedure, router } from "../trpc.js";

export const healthRouter = router({
  ping: anonymousProcedure.query(() => ({
    ok: true,
    service: "sirel-modern-server",
    timestamp: new Date().toISOString()
  }))
});
