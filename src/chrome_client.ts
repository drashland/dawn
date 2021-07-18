// https://peter.sh/experiments/chromium-command-line-switches/

import { BuildOptions, Client } from "./client.ts";
import { existsSync } from "./utility.ts";

/**
   * Gets the full path to the chrome executable on the users filesystem
   *
   * @returns The path to chrome
   */
export function getChromePath(): string {
  const paths = {
    // deno-lint-ignore camelcase
    windows_chrome_exe:
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    // deno-lint-ignore camelcase
    windows_chrome_exe_x86:
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    linux: "/usr/bin/google-chrome",
  };
  let chromePath = "";
  switch (Deno.build.os) {
    case "darwin":
      chromePath = paths.darwin;
      break;
    case "windows":
      if (existsSync(paths.windows_chrome_exe)) {
        chromePath = paths.windows_chrome_exe;
        break;
      }
      if (existsSync(paths.windows_chrome_exe_x86)) {
        chromePath = paths.windows_chrome_exe_x86;
        break;
      }

      throw new Error(
        "Cannot find path for chrome in windows. Submit an issue if you encounter this error",
      );
    case "linux":
      chromePath = paths.linux;
      break;
  }
  return chromePath;
}

export class ChromeClient extends Client {
  //////////////////////////////////////////////////////////////////////////////
  // FILE MARKER - METHODS - PUBLIC ////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  public static async build(options: BuildOptions = {}): Promise<Client> {
    // Setup build options
    if (!options.debuggerPort) {
      options.debuggerPort = 9292;
    }
    if (!options.defaultUrl) {
      options.defaultUrl = "https://chromestatus.com";
    }
    if (!options.hostname) {
      options.hostname = "localhost";
    }

    // Create the sub process
    const args = [
      options.binaryPath || getChromePath(),
      "--headless",
      "--remote-debugging-port=" + options.debuggerPort,
      "--disable-gpu",
      "--no-sandbox",
      options.defaultUrl,
    ];
    return await Client.create(args, {
      hostname: options.hostname,
      port: options.debuggerPort,
    }, "chrome");
  }
}
