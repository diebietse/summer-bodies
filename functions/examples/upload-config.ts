// Run with: npm run ts ./examples/upload-config.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory

import { Firestore, SummerBodiesConfig } from "../src/firestore";
import jsonConfig from "../../example-config.json";

async function uploadConfig() {
  let config: SummerBodiesConfig = <SummerBodiesConfig>jsonConfig;
  console.log(config);
  await Firestore.uploadConfig(config);
  console.log("Config uploaded");
}

uploadConfig();
