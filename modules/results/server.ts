// The results module's backend sockets: an hourly schedule that stores the feed's finished matches
// (the feed only keeps the rolling day, so an hourly fetch sees every finished match before it rolls
// off), and the daily's score source (dailyResults) that reads the stored history for an issue's
// window. Rank and capping are the engine's, from the industry's RESULT_SECTION.
import type { ServerModule } from "@aihot/backend/modules";
import { fetchFinishedMatches, storeMatches, windowMatches } from "./qiumibao.ts";

/** One fetch round: store whatever finished matches the feed holds. Feed down leaves the table as it was. */
export async function syncResults(): Promise<number> {
  return storeMatches(await fetchFinishedMatches());
}

export const resultsServer: ServerModule = {
  name: "results",
  schedules: [{ name: "results.fetch", cron: "6 * * * *", run: syncResults, missed: "once" }],
  dailyResults: { matches: ({ start, end }) => windowMatches(start, end) },
};

export default resultsServer;
