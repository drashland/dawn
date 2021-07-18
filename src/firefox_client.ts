// https://stackoverflow.com/questions/50395719/firefox-remote-debugging-with-websockets
// FYI for reference, we can connect using websockets, but severe lack of documentation gives us NO info on how to proceed after:
/**
 * $ <firefox binary> --profile <profile> --headless --remote-debugging-port 1448
 * ```ts
 * const res = await fetch("http://localhost:1448/json/list")
 * const json = await res.json()
 * consy url = json[json.length - 1]["webSocketDebuggerUrl"]
 * const c = new WebSocket(url)
 * ```
 */

import { BuildOptions, Client } from "./client.ts";

export const defaultBuildOptions = {
  hostname: Deno.build.os === "windows" ? "127.0.0.1" : "localhost",
  debuggerServerPort: 9293,
  defaultUrl: "https://developer.mozilla.org/",
};

/**
 * Get full path to the firefox binary on the user'ss filesystem.
 * Thanks to [caspervonb](https://github.com/caspervonb/deno-web/blob/master/browser.ts)
 *
 * @returns the path
 */
export function getFirefoxPath(): string {
  switch (Deno.build.os) {
    case "darwin":
      return "/Applications/Firefox.app/Contents/MacOS/firefox";
    case "linux":
      return "/usr/bin/firefox";
    case "windows":
      return "C:\\Program Files\\Mozilla Firefox\\firefox.exe";
  }
}

/**
 * @example
 *
 *     const Firefox = await FirefoxClient.build()
 *     await Firefox.<api_method>
 */
export class FirefoxClient extends Client {
  //////////////////////////////////////////////////////////////////////////////
  // FILE MARKER - METHODS - PUBLIC ////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Entry point for creating a headless firefox browser.
   * Creates a dev profile to be used by Firefox, creates the headless browser and sets up the connection to
   *
   * @param buildOptions - Any extra options you wish to provide to customise how the headless browser sub process is ran
   *   - hostname: Defaults to 0.0.0.0 for macos/linux, 127.0.0.1 for windows
   *   - port: Defaults to 9293
   *   - url: Defaults to https://developer.mozilla.org/
   *
   * @returns An instance of FirefoxClient, that is now ready.
   */
  public static async build(
    buildOptions: BuildOptions = {},
  ): Promise<Client> {
    // Setup the options to defaults if required
    if (!buildOptions.hostname) {
      buildOptions.hostname = defaultBuildOptions.hostname;
    }
    if (!buildOptions.debuggerPort) {
      buildOptions.debuggerPort = defaultBuildOptions.debuggerServerPort;
    }
    if (!buildOptions.defaultUrl) {
      buildOptions.defaultUrl = defaultBuildOptions.defaultUrl;
    }
    // Create the profile the browser will use. Create a test one so we can enable required options to enable communication with it
    const tmpDirName = Deno.makeTempDirSync();
    // Create the arguments we will use when spawning the headless browser
    const args = [
      buildOptions.binaryPath || getFirefoxPath(),
      "--start-debugger-server",
      buildOptions.debuggerPort.toString(),
      "--remote-debugging-port",
      buildOptions.debuggerPort.toString(),
      "--headless",
      "-profile",
      tmpDirName,
    ];
    if (buildOptions.defaultUrl) {
      args.push(buildOptions.defaultUrl);
    }
    // Create the sub process to start the browser
    return await Client.create(
      args,
      {
        hostname: buildOptions.hostname,
        port: buildOptions.debuggerPort,
      },
      "firefox",
      tmpDirName,
    );
  }
}
