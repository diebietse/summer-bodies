// Fixture data for the local preview route (see views/Preview.vue and README.md "Local preview").
// Not used anywhere in the real app - only Preview.vue imports this, and Preview.vue only exists in dev builds.
// Shaped exactly like the ChallengeResults JSON functions/src/bot.ts stores and /results/:id serves.
export const mockResults = {
  startDate: 1791158400, // 2026-10-05 00:00 UTC (Monday)
  endDate: 1791763200, // 2026-10-12 00:00 UTC (next Monday)
  currentTime: 1791450900, // 2026-10-08 09:15 UTC (Thursday - mid-week, so the "in progress" scenario reads correctly)
  topResults: [
    {
      name: "On Foot",
      groupings: [
        {
          name: "Duration",
          unit: "min",
          contestants: [
            { name: "Alex Carter", total: 412, fitcoin: 5 },
            { name: "Jamie Lee", total: 389, fitcoin: 4 },
            { name: "Morgan Reyes", total: 355, fitcoin: 3 },
            { name: "Taylor Brooks", total: 240, fitcoin: 2 },
            { name: "Riley Cohen", total: 190, fitcoin: 1 },
          ],
        },
        {
          name: "Distance",
          unit: "km",
          contestants: [
            { name: "Alex Carter", total: 58, fitcoin: 5 },
            { name: "Morgan Reyes", total: 51, fitcoin: 4 },
            { name: "Jamie Lee", total: 47, fitcoin: 3 },
            { name: "Taylor Brooks", total: 29, fitcoin: 2 },
            { name: "Jordan Blake", total: 22, fitcoin: 1 },
          ],
        },
        {
          name: "Elevation",
          unit: "m",
          contestants: [
            { name: "Morgan Reyes", total: 890, fitcoin: 5 },
            { name: "Alex Carter", total: 640, fitcoin: 4 },
            { name: "Casey Nguyen", total: 410, fitcoin: 3 },
            { name: "Jamie Lee", total: 380, fitcoin: 2 },
            { name: "Taylor Brooks", total: 150, fitcoin: 1 },
          ],
        },
      ],
    },
    {
      name: "On Wheels",
      groupings: [
        {
          name: "Duration",
          unit: "min",
          contestants: [
            { name: "Jordan Blake", total: 320, fitcoin: 5 },
            { name: "Riley Cohen", total: 275, fitcoin: 4 },
            { name: "Casey Nguyen", total: 180, fitcoin: 3 },
          ],
        },
        {
          name: "Distance",
          unit: "km",
          contestants: [
            { name: "Jordan Blake", total: 142, fitcoin: 5 },
            { name: "Riley Cohen", total: 118, fitcoin: 4 },
            { name: "Casey Nguyen", total: 76, fitcoin: 3 },
          ],
        },
        {
          name: "Elevation",
          unit: "m",
          contestants: [
            { name: "Riley Cohen", total: 1240, fitcoin: 5 },
            { name: "Jordan Blake", total: 980, fitcoin: 4 },
            { name: "Casey Nguyen", total: 410, fitcoin: 3 },
          ],
        },
      ],
    },
    {
      name: "Other",
      groupings: [
        {
          name: "Duration",
          unit: "min",
          contestants: [
            { name: "Jamie Lee", total: 180, fitcoin: 10 },
            { name: "Taylor Brooks", total: 150, fitcoin: 9 },
            { name: "Alex Carter", total: 120, fitcoin: 8 },
          ],
        },
      ],
    },
    {
      name: "Mile Challenge",
      groupings: [
        {
          name: "Attempts",
          unit: "",
          contestants: [
            { name: "Alex Carter", total: 4, fitcoin: 5 },
            { name: "Morgan Reyes", total: 3, fitcoin: 4 },
            { name: "Jamie Lee", total: 2, fitcoin: 3 },
          ],
        },
        {
          name: "Pace",
          unit: "min/km",
          contestants: [
            { name: "Morgan Reyes", total: 4.15, fitcoin: 5 },
            { name: "Alex Carter", total: 4.42, fitcoin: 4 },
            { name: "Taylor Brooks", total: 5.05, fitcoin: 3 },
          ],
        },
      ],
    },
  ],
  goalResults: [
    { name: "Alex Carter", achieved: true, activities: 5, totalTimeMin: 412, goal: 3, fitcoin: 10 },
    { name: "Jamie Lee", achieved: true, activities: 4, totalTimeMin: 389, goal: 3, fitcoin: 10 },
    { name: "Morgan Reyes", achieved: true, activities: 4, totalTimeMin: 355, goal: 3, fitcoin: 10 },
    { name: "Taylor Brooks", achieved: true, activities: 3, totalTimeMin: 240, goal: 3, fitcoin: 10 },
    { name: "Jordan Blake", achieved: false, activities: 2, totalTimeMin: 130, goal: 3, fitcoin: 0 },
    { name: "Riley Cohen", achieved: false, activities: 1, totalTimeMin: 45, goal: 3, fitcoin: 0 },
    { name: "Casey Nguyen", achieved: false, activities: 2, totalTimeMin: 95, goal: 3, fitcoin: 0 },
  ],
  streaks: [
    { athleteId: "1", name: "Alex Carter", alive: true, currentStreak: 12 },
    { athleteId: "2", name: "Jamie Lee", alive: true, currentStreak: 12 },
    { athleteId: "3", name: "Morgan Reyes", alive: true, currentStreak: 9 },
    { athleteId: "4", name: "Casey Nguyen", alive: false, currentStreak: 8 },
    { athleteId: "5", name: "Taylor Brooks", alive: true, currentStreak: 5 },
  ],
};
