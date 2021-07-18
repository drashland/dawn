import { ChromeClient } from "./src/chrome_client.ts";
import { FirefoxClient } from "./src/firefox_client.ts";
import { BuildOptions } from "./src/client.ts";

export { ChromeClient, FirefoxClient };

type Browsers = "firefox" | "chrome";

export async function buildFor(
  browser: Browsers,
  options?: BuildOptions,
): Promise<ChromeClient | FirefoxClient> {
  if (browser === "firefox") {
    return await FirefoxClient.build(options);
  } else {
    return await ChromeClient.build(options);
  }
}
