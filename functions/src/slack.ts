import axios from "axios";

// Based on https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/
export class Slack {
  constructor(
    private webHookUrl: string,
    private channel?: string,
  ) {}

  async post(message: string) {
    await axios.post(this.webHookUrl, {
      text: message,
      channel: this.channel,
    });
  }

  // To help build blocks use: https://app.slack.com/block-kit-builder/
  async postBlocks(blocks: any) {
    await axios.post(this.webHookUrl, {
      channel: this.channel,
      blocks: blocks,
    });
  }

  // One message with an image block per section (e.g. Challenge Results, Goal Achievements, Streak Challenge).
  async postResults(mainMessage: string, images: ResultsImage[], resultsUrl: string) {
    await this.postBlocks([
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: mainMessage,
        },
      },
      ...images.map((image) => ({
        type: "image",
        title: { type: "plain_text", text: image.title },
        image_url: image.url,
        alt_text: image.title,
      })),
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${resultsUrl}|Or check it out on the web!>`,
        },
      },
    ]);
  }
}

export interface ResultsImage {
  title: string;
  url: string;
}
