import AsciiTable from "ascii-table";
import moment from "moment";
import { ChallengeEvent, GoalResult, ContestantFitcoin, Grouping, Athlete } from "./challenge-models";

export class Format {
  static inProgressEventTop(event: ChallengeEvent): string {
    if (!Format.hasContestants(event.groupings)) return "";

    const title = `Top '${event.name}' so far this week\n`;
    return `${title}\n${this.codeBlock(this.eventTopTable(event, "POSSIBLE FITCOIN"))}`;
  }

  static finalEventTop(event: ChallengeEvent): string {
    if (!Format.hasContestants(event.groupings)) return "";

    const title = `Final top '${event.name}' last week\n`;
    return `${title}\n${this.codeBlock(this.eventTopTable(event, "FITCOIN"))}\n`;
  }

  static hasContestants(groupings: Grouping[]): boolean {
    for (const grouping of groupings) {
      if (grouping.contestants.length > 0) return true;
    }
    return false;
  }

  static eventTopTable(eventToFormat: ChallengeEvent, fitcoinHeading: string): string {
    const headings = ["#"];
    eventToFormat.groupings.forEach((group) => {
      headings.push(group.name, "");
    });
    headings.push(fitcoinHeading);

    const table = new AsciiTable();
    table.setHeading(...headings);

    const contestantCount = eventToFormat.groupings[0].contestants.length;
    for (let i = 0; i < contestantCount; i++) {
      const fitcoinAwarded = eventToFormat.groupings[0].contestants[i].fitcoin
      const row = [`${i + 1}`]; // Row number
      eventToFormat.groupings.forEach((group) => {
        const contestant = group.contestants[i];
        if (contestant) {
          if (group.unit == "min/km") {
            const pace = moment.utc(moment.duration(contestant.total, "minutes").asMilliseconds()).format("m:ss");
            row.push(contestant.name, `${pace}${group.unit}`);
          } else {
            row.push(contestant.name, `${contestant.total}${group.unit}`);
          }
        } else {
          row.push("", "");
        }
      });
      row.push(`${fitcoinAwarded}`); // Fitcoin number
      table.addRow(...row);
    }
    return table.toString();
  }

  static weeklyGoalTable(weeklyResults: GoalResult[]): string {
    const table = new AsciiTable();
    table.setHeading("NAME", "TOTAL QUALIFYING TIME", "WEEKLY GOAL");
    weeklyResults.forEach((weeklyResult) => {
      if (weeklyResult.activities > 0) {
        table.addRow(weeklyResult.name, `${weeklyResult.totalTimeMin}min`, Format.activityCount(weeklyResult));
      }
    });
    return table.toString();
  }

  static athleteTable(athletes: Athlete[]): string {
    const table = new AsciiTable();
    table.setHeading("NAME", "GROUP");
    athletes.forEach((athlete) => {
      table.addRow(`${athlete.firstname} ${athlete.lastname}`, athlete.club);
    });
    return table.toString();
  }

  static fitcoinTable(contestants: ContestantFitcoin[]): string {
    const table = new AsciiTable();
    table.setHeading("NAME", "FITCOIN RECEIVED");
    contestants.forEach((contestant) => {
      table.addRow(contestant.name, `${contestant.fitcoin} FC`);
    });
    return table.toString();
  }

  static goalStatus(title: string, weeklyResults: GoalResult[]): string {
    return `${title}\n${Format.codeBlock(Format.weeklyGoalTable(weeklyResults))}`;
  }

  static athletes(title: string, athletes: Athlete[]): string {
    return `${title}\n${Format.codeBlock(Format.athleteTable(athletes))}`;
  }

  static fitcoinStatus(title: string, contestants: ContestantFitcoin[]): string {
    return `${title}\n${Format.codeBlock(Format.fitcoinTable(contestants))}`;
  }

  static activityCount(weeklyResult: GoalResult): string {
    return `${weeklyResult.achieved ? "✓" : "✘"} ${weeklyResult.activities}/${weeklyResult.goal}`;
  }

  static codeBlock(toFormat: string): string {
    return `\`\`\`\n${toFormat}\n\`\`\``;
  }
}
