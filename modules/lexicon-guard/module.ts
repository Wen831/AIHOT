// The lexicon guard's addresses: it owns no pages or api paths; its screen runs inside the engine's
// analysis (editorial/analyze.ts), before any model step.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({ name: "lexicon-guard" });
