import axios from "axios";

// Based on https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/
export class Slack {
  constructor(private webHookUrl: string, private channel?: string) {}

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

  async postResults(mainMessage: string, imageUrl: string, resultsUrl: string) {
    await this.postBlocks([
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: mainMessage,
        },
      },
      {
        type: "image",
        image_url: imageUrl,
        alt_text: "Results",
      },
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
