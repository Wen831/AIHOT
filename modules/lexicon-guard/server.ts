// The lexicon guard's backend socket: one local guard over every analysis's material. Built once at
// startup — the lists ship inside the image, so changing them is a rebuild, not a restart.
import { defineServerModule } from "@aihot/backend/modules";
import { buildGuard } from "./guard.ts";

const guard = buildGuard();

export const lexiconGuardServer = defineServerModule({
  name: "lexicon-guard",
  localGuard: guard,
});

export default lexiconGuardServer;
