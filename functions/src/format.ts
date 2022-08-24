import AsciiTable from "ascii-table";
import moment from "moment";
import { StravaEvent, Club, WeeklyResult, ContestantFitcoin } from "./challenge-models";

export class Format {
  static inProgressClubTop5(clubToFormat: Club): string {
    let formatted = "";
    clubToFormat.events.forEach((event) => {
      const title = `Top '${event.name}' for '${clubToFormat.name}' so far this week\n`;
      formatted += `${title}\n${this.codeBlock(this.eventTop5Table(event, "POSSIBLE FITCOIN"))}\n`;
    });
    return formatted;
  }

  static finalClubTop5(clubToFormat: Club): string {
    let formatted = "";
    clubToFormat.events.forEach((event) => {
      const title = `Final top '${event.name}' for '${clubToFormat.name}' last week\n`;
      formatted += `${title}\n${this.codeBlock(this.eventTop5Table(event, "FITCOIN"))}\n`;
    });
    return formatted;
  }

  static eventTop5Table(eventToFormat: StravaEvent, fitcoinHeading: string): string {
    const headings = ["#"];
    eventToFormat.groupings.forEach((group) => {
      headings.push(group.name, "");
    });
    headings.push(fitcoinHeading);

    const table = new AsciiTable();
    table.setHeading(...headings);

    for (let i = 0; i < 5; i++) {
      let anyResult = false;

      const row = [`${i + 1}`];
      eventToFormat.groupings.forEach((group) => {
        const contestant = group.contestants[i];
        if (contestant) {
          anyResult = true;
          if (group.unit  == "min/km") {
            const pace = moment.utc(moment.duration(contestant.total, 'minutes').asMilliseconds()).format('m:ss')
            row.push(contestant.name, `${pace}${group.unit}`);
          } else {
            row.push(contestant.name, `${contestant.total}${group.unit}`);
          }
        } else {
          row.push("", "");
        }
      });
      row.push(`${5 - i}`);

      if (!anyResult) break;
      table.addRow(...row);
    }
    return table.toString();
  }

  static weeklyGoalTable(weeklyResults: WeeklyResult[]): string {
    const table = new AsciiTable();
    table.setHeading("NAME", "TOTAL QUALIFYING TIME", "WEEKLY GOAL");
    weeklyResults.forEach((weeklyResult) => {
      if (weeklyResult.activities > 0) {
        table.addRow(weeklyResult.name, `${weeklyResult.totalTimeMin}min`, Format.activityCount(weeklyResult));
      }
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

  static goalStatus(title: string, weeklyResults: WeeklyResult[]): string {
    return `${title}\n${Format.codeBlock(Format.weeklyGoalTable(weeklyResults))}`;
  }

  static fitcoinStatus(title: string, contestants: ContestantFitcoin[]): string {
    return `${title}\n${Format.codeBlock(Format.fitcoinTable(contestants))}`;
  }

  static activityCount(weeklyResult: WeeklyResult): string {
    return `${weeklyResult.achieved ? "✓" : "✘"} ${weeklyResult.activities}/${weeklyResult.goal}`;
  }

  static codeBlock(toFormat: string): string {
    return `\`\`\`\n${toFormat}\n\`\`\``;
  }
}
