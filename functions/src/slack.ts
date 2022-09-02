import axios from "axios";

export class Slack {
  constructor(private webHookUrl: string, private channel?: String) {}

  async post(message: String) {
    await axios.post(this.webHookUrl, { text: message, channel: this.channel });
  }
}
