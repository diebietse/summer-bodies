import axios from "axios";

export class Slack {
  constructor(private webHookUrl: string) {}

  async post(message: String) {
    await axios.post(this.webHookUrl, { text: message });
  }
}
