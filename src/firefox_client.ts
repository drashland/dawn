import { assertEquals } from "../deps.ts";

const UNSOLICITED_EVENTS = [
  "styleApplied",
  "propertyChange",
  "networkEventUpdate",
  "networkEvent",
  "propertyChange",
  "newMutations",
  "appOpen",
  "appClose",
  "appInstall",
  "appUninstall",
  "frameUpdate",
  "tabListChanged",
  "consoleAPICall",
];

interface Tab {
  actor: string; // eg "server1.conn18.tabDescriptor1",
  browserContextID: number;
  isZombieTab: boolean;
  outerWindowId: number;
  selected: true; // If this is the web page we are viewing
  title: string; // Title of the web page
  traits: {
    isBrowsingContext: true;
  };
  url: string; // eg "https://chromestatus.com/features"
  consoleActor: string;
  inspectorActor: string;
  styleSheetsActor: string;
  storageActor: string;
  memoryActor: string;
  framerateActor: string;
  reflowActor: string;
  cssPropertiesActor: string;
  performanceActor: string;
  animationsActor: string;
  responsiveActor: string;
  contentViewerActor: string;
  webExtensionInspectedWindowActor: string;
  accessibilityActor: string;
  screenshotActor: string;
  changesActor: string;
  webSocketActor: string;
  eventSourceActor: string;
  manifestActor: string;
  networkContentActor: string;
}

interface ListTabsResponse {
  tabs: Array<Tab>;
}

async function waitUntilConnected(
  options: {
    hostname: string;
    port: number;
  },
): Promise<void> {
  let iterations = 0;
  const maxIterations = 30;
  async function tryConnect(hostname: string, port: number) {
    try {
      const conn = await Deno.connect({
        port,
        hostname,
      });
      conn.close();
      // This means we can connect so its ready
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.ConnectionRefused) { // No listener yet
        iterations++;
        console.log("Conn rfused");
        return false;
      }
      throw new Error(
        `Uncaught Exception: Please log an issue at https://github.com/drashland/sinco as to how you encountered this`,
      );
    }
  }
  const { hostname, port } = options;
  const canConnect = await tryConnect(hostname, port);
  if (canConnect) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return;
  }
  if (iterations === maxIterations) { // then there really is a problem and an error was thrown waaayyy too many times
    throw new Error(`Connection refused for hostname=${hostname} port=${port}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  return await waitUntilConnected(options);
}

export interface BuildOptions {
  hostname?: string; // Hostname for our connection to connect to. Can be "0.0.0.0" or "your_container_name"
  debuggerServerPort?: number; // Port for the debug server to listen on, which our connection will connect to
  defaultUrl?: string; // The default url the browser will open when ran
}

interface Configs {
  conn: Deno.Conn;
  // deno-lint-ignore camelcase
  browser_process: Deno.Process;
  actor: string;
  tab: Tab | null;
  devProfileDirPath: string;
}

export const defaultBuildOptions = {
  hostname: Deno.build.os === "windows" ? "127.0.0.1" : "0.0.0.0",
  debuggerServerPort: 9293,
  defaultUrl: "https://developer.mozilla.org/",
};

/**
 * @example
 *
 *     const Firefox = await FirefoxClient.build()
 *     await Firefox.<api_method>
 */
export class FirefoxClient {
  /**
   * The connection to our headless browser
   */
  private readonly conn: Deno.Conn;

  /**
   * The browser process that is running the headless browser
   */
  private readonly browser_process: Deno.Process;

  /**
   * Our main actor for the tab
   */
  private readonly actor: string;

  /**
   * The tab for our browser
   */
  private readonly tab: Tab | null = null;

  /**
   * Holds messages that we need, but was sent along another useful packet in a message,
   * so store it here to be returned next time we request a packet
   */
  // deno-lint-ignore no-explicit-any Holds packets, and as they can be anything we use any here
  private incoming_message_queue: Record<string, any>[] = [];

  /**
   * The path to the dev profile for firefox
   */
  private readonly dev_profile_dir_path: string;

  /**
   * @param configs - Used to provide an API that can communicate with the headless browser
   */
  constructor(configs: Configs) {
    this.conn = configs.conn;
    this.browser_process = configs.browser_process;
    this.actor = configs.actor;
    this.tab = configs.tab ?? null;
    this.dev_profile_dir_path = configs.devProfileDirPath;
  }

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
  ): Promise<FirefoxClient> {
    // Setup the options to defaults if required
    if (!buildOptions.hostname) {
      buildOptions.hostname = defaultBuildOptions.hostname;
    }
    if (!buildOptions.debuggerServerPort) {
      buildOptions.debuggerServerPort = defaultBuildOptions.debuggerServerPort;
    }
    if (!buildOptions.defaultUrl) {
      buildOptions.defaultUrl = defaultBuildOptions.defaultUrl;
    }
    // Create the profile the browser will use. Create a test one so we can enable required options to enable communication with it
    const tmpDirName = await Deno.makeTempDir();
    const devProfilePath = tmpDirName + "/prefs.js";
    await Deno.writeFile(
      devProfilePath,
      new TextEncoder().encode(
        'user_pref("devtools.chrome.enabled", true);' + "\n" +
          'user_pref("devtools.debugger.prompt-connection", false);' + "\n" +
          'user_pref("devtools.debugger.remote-enabled", true);' + "\n" +
          `user_pref('toolkit.telemetry.reportingpolicy.firstRun', false);`, // Don't open that extra tab
      ),
    );
    console.log(`Dev profile path: ${devProfilePath}`);
    // Get the path to the users firefox binary
    const firefoxPath = this.getFirefoxPath();
    // Create the arguments we will use when spawning the headless browser
    const args = [
      "--start-debugger-server", // todo :: only needs 1ddash for windows?
      buildOptions.debuggerServerPort.toString(),
      "--profile", // todo :: only needs 1ddash for windows?
      tmpDirName,
      "--headless", // todo :: only needs 1ddash for windows?
      buildOptions.defaultUrl,
    ];
    console.log("run args:");
    console.log([firefoxPath, ...args]);
    // Create the sub process to start the browser
    console.log("Cmd:");
    console.log([firefoxPath, ...args]);
    const browserProcess = Deno.run({
      cmd: [firefoxPath, ...args],
      stderr: "piped",
      stdout: "piped",
    });
    // Wait until the port is occupied
    await waitUntilConnected({
      hostname: buildOptions.hostname,
      port: buildOptions.debuggerServerPort,
    });
    // Connect
    const conn = await Deno.connect({
      hostname: buildOptions.hostname,
      port: buildOptions.debuggerServerPort,
    });
    for await (const line of Deno.iter(conn)) { // get 'welcome' message out the way. Or use `await iter.next()`
      break;
    }
    // Get actor (tab) that we use to interact with
    const TempFirefoxClient = new FirefoxClient({
      conn,
      browser_process: browserProcess,
      actor: "root",
      tab: null,
      devProfileDirPath: tmpDirName,
    }); // "root" required as the "to" when we send a request to get tabs
    const tab = await TempFirefoxClient.listTabs();
    const actor = tab.actor;
    // Start listeners for console. This is required if we wish to use things like `evaluateJS`
    await TempFirefoxClient.request("startListeners", {
      listeners: [
        "PageError",
        "ConsoleAPI",
        "NetworkActivity", // to handle things like clicking buttons that go to different pages so we can check the page changed
        //"FileActivity"
      ],
    }, tab.consoleActor);
    // Wait a few seconds for it to start. This is what foxdriver recommends. TODO Maybe we dont need this, or maybe theres a faster way to check eg tab navigated event?
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // Attach the tab we are using to the client, so we can use things like`evaluateJS`
    await TempFirefoxClient.request("attach", {}, tab.actor);
    // Return the client :)
    return new FirefoxClient({
      conn,
      browser_process: browserProcess,
      actor,
      tab,
      devProfileDirPath: tmpDirName,
    });
  }

  /**
   * Assert that you see certain text on the page
   *
   * @param text - The text you expect to see
   */
  public async assertSee(text: string): Promise<void> {
    const command = `document.body.innerText.indexOf('${text}') >= 0`;
    const result = await this.evaluatePage(command) as boolean;
    // If we know the assertion will fail, close all connections
    if (result !== true) {
      await this.done();
    }
    assertEquals(result, true);
  }

  /**
   * Assert that the url for the page you are on matches `url`
   *
   * @param url - The url to assert it equals the url of the page
   */
  public async assertUrlIs(url: string): Promise<void> {
    const result = await this.evaluatePage(`window.location.href`) as string;
    // If we know the assertion will fail, close all connections
    if (result !== url) {
      await this.done();
    }
    assertEquals(result, url);
  }

  /**
   * Navigate to a URL of your choice
   *
   * @param url - The full url, eg "https://google.com"
   */
  public async goTo(url: string): Promise<void> {
    await this.request("navigateTo", { url });
    console.log("Going to wait until pagehas  loaded");
    const result = await this.waitForSpecificPacket(this.actor, {
      type: "tabNavigated",
      state: "stop",
    });
    if (result.title === "Server Not Found") {
      await this.done(
        `net::ERR_NAME_NOT_RESOLVED: Error for navigating to page "${url}"`,
      );
    }
    // We don't return anything here, because the response data is nothing useful, for example we get the following: `{ id: 44, message: { from: "server1.conn0.child4/frameTarget1" } }`
  }

  /**
   * Click an element by the selector. This
   * assumes that clicking will change the page
   * you are on.
   *
   * @param selector - The element to click, eg `button#submit` or `a[href="/login"]`
   */
  public async click(selector: string): Promise<void> {
    const command = `document.querySelector('${selector}').click()`;
    await this.evaluatePage(command);
  }

  /**
   * Wait for the page to change to a different page. Used for when clicking a button and that
   * button sends the user to another page
   */
  public async waitForPageChange(): Promise<void> {
    await this.waitForSpecificPacket(this.actor, {
      type: "tabNavigated",
      "state": "stop",
    });
  }

  /**
   * Get the value of an input element
   *
   * @param selector - The selector to use to get thee value from. Eg., `input[name="username"]`
   *
   * @returns The value for the input element
   */
  public async getInputValue(selector: string): Promise<string> {
    const command = `document.querySelector('${selector}').value`;
    const result = await this.evaluatePage(command);
    if (typeof result === "object" && "type" in result) {
      return result.type;
    }
    return result;
  }

  /**
   * Set the value of `selector`
   *
   * @param selector - Used inside `.querySelector`
   * @param value - The value to set the elements value to
   */
  public async type(selector: string, value: string): Promise<void> {
    const command = `document.querySelector('${selector}').value = "${value}"`;
    await this.evaluatePage(command);
  }

  /**
   * Evaluate a script for the current context of the page.
   * In short: Run JavaScript just like you would in the console.
   *
   * Internal message: This method requires "PageError" and "ConsoleAPI" listeners to be enabled.
   *
   * @param pageCommand - The string or function to evaluate against.
   *
   * @example
   *
   *     const title = await Firefox.evaluatePage(`document.title`)
   *     const children = await Firefox.evaluatePage(() => document.body.children)
   *
   * @returns The result of the evaluation, could be a string, or a boolean etc
   */
  public async evaluatePage(
    pageCommand: (() => unknown) | string,
    // deno-lint-ignore no-explicit-any It could be any value we get from the console
  ): Promise<any> {
    console.log("At  top ofeval page func, requesting now...");
    const text = typeof pageCommand === "string"
      ? `(function () { return ${pageCommand} }).apply(window, [])`
      : `(${pageCommand}).apply(window, [])`;
    const { resultID } = await this.request("evaluateJSAsync", {
      text,
    }, this.tab!.consoleActor);
    console.log(
      "just got the result id, now waiting for a specific packet from " +
        this.tab!.consoleActor + " with  result id  of " + resultID,
    );
    const evalResult = await this.waitForSpecificPacket(
      this.tab!.consoleActor,
      {
        resultID,
      },
    );
    console.log("got eval result, here it is:");
    console.log(evalResult);
    if ("exception" in evalResult) {
      const preview = evalResult.exception.preview;
      await this.done(`${preview.kind}: ${preview.message}`);
    }
    const output = evalResult.result;
    return output;
  }

  /**
   * Close all connections with the browser, and stop the sub process.
   *
   * @param errMsg - If supplied, will still close everything (cleanup) and throw an error with that message
   */
  public async done(errMsg?: string): Promise<void> {
    try {
      this.conn.close();
      this.browser_process.stderr!.close();
      this.browser_process.stdout!.close();
      this.browser_process.close();
      await Deno.remove(this.dev_profile_dir_path, { recursive: true });
    } catch (err) {
      // ... do nothing
    }
    if (Deno.build.os === "windows") {
      // Oddly, running `p.close()` doesn't actually close the process on windows, and there can still be about 4-6 processes running after a single tests.
      // As you can tell, many of these will take a too much many and the systme will fail. This is what we do here
      // This means that it will also close the firefox client a user may be using
      const p = Deno.run({
        cmd: ["taskkill", "/F", "/IM", "firefox.exe"],
        stdout: "null",
        stderr: "null",
      });
      await p.status();
      p.close();
    }
    if (errMsg) {
      throw new Error(errMsg);
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // FILE MARKER - METHODS - PRIVATE ///////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Our async iterator to handle reading packets from the connection,
   * and parsing them into a usable format
   *
   * @returns An async iterator to get the next packet from
   */
  // deno-lint-ignore no-explicit-any Packets can be anything
  private async *readPackets(): AsyncIterableIterator<Record<string, any>> {
    const decoder = new TextDecoder();
    let partial = "";
    for await (const chunk of Deno.iter(this.conn)) {
      const decodedChunk = decoder.decode(chunk);
      console.log("Chunk we will be parsing:");
      console.log(decodedChunk);
      const rawPackets = decodedChunk
        .split(/[0-9]{1,4}:{/) // split and get rid of the ids so each item should be parsable json
        .filter((packet) => packet !== "")
        .map((msg, i) => {
          // We want to re add the {, but in the instance `message` is `d":4}125:{...}`, we should add it to the first packet because its the last aprt of a partial, so if we do, then we can't combine them together
          if (i === 0) {
            // We'll try parse it, if we cant then we know its a partial, so dont add the bracket
            try {
              JSON.parse("{" + msg);
              return `{${msg}`;
            } catch (err) {
              return msg;
            }
          } else {
            return "{" + msg;
          }
        }); // add back the `{` that we removed above, so we can still easily parse it
      // Turn the packets into json, if it fails then it means a packet is partial, so we save it
      console.log(rawPackets);
      const json = rawPackets.map((obj) => {
        try {
          return JSON.parse(obj);
        } catch (err) {
          console.log("A packet in the message isnt full, saving it: " + obj);
          partial += obj;
        }
      }).filter((obj) => obj !== undefined);
      // Then try check if partial is full, if it is then add it to the packets (at start, because remember this packet still originally came first
      try {
        const j = JSON.parse(partial);
        console.log(
          "we found the last aprt to a partial, adding it to the start of the arr: " +
            partial,
        );
        partial = "";
        json.unshift(j);
      } catch (err) {
        // still a partial, do nothing
      }

      console.log("all packets:");
      console.log(json);
      const validPackets = json.filter((packet) => {
        if (UNSOLICITED_EVENTS.includes(packet.type) === true) {
          return false;
        }
        if (packet.type === "pageError") {
          if (packet.pageError.warning == true) {
            return false;
          }
          if (packet.pageError.error == true) { // TODO Should we provide a method to get everything in the console, we'll need to remove this because this is the kind of packet for the errors in the dev console
            return false;
          }
        }
        if (packet.type === "tabNavigated" && packet.state === "start") {
          return false;
        }
        return true;
      });
      if (validPackets.length === 0) {
        continue;
      }
      console.log("packets from iterr:");
      console.log(validPackets);
      // If valid packets is more than 1, it means we just need to queue the next ones after returning the first
      const packet = validPackets.shift();
      validPackets.forEach((packet, i) => {
        console.log("Going to push the below packet to the queue:");
        console.log(packet);
        this.incoming_message_queue.push(packet);
      });
      console.log(`Got packet:`);
      console.log(packet);
      yield packet;
    }
  }

  /**
   * Waits to get a single packet from the connection that
   * matches the actor and params
   *
   * @param actor - The actor that the packet should be from
   * @param params - A object that the packet should match (or at least contains all keys and values for)
   *
   * @returns The packet
   */
  private async waitForSpecificPacket(
    actor: string,
    params: Record<string, number | string>,
    // deno-lint-ignore no-explicit-any Again, we are returning a packet and it could be anything
  ): Promise<Record<string, any>> {
    console.log("Called waiting for specifc packet");
    if (this.incoming_message_queue.length) {
      console.log("packets exist in queue, returning:");
      const packet = this.incoming_message_queue[0];
      if (packet.actor !== actor) {
        console.log(packet);
      }
      this.incoming_message_queue.shift();
      return packet;
    }
    const iterator = this.readPackets();
    const n = await iterator.next();
    const value = n.value;
    console.log("got the nnext packet, here it is:");
    console.log(value);
    if (value.from !== actor) {
      return await this.waitForSpecificPacket(actor, params);
    }
    if (!value.type) {
      return await this.waitForSpecificPacket(actor, params);
    }
    const paramsKeys = Object.keys(params);
    const paramsKeysLen = paramsKeys.length;
    let matchedProps = 0;
    paramsKeys.forEach((key) => {
      if (value[key] && value[key] === params[key]) {
        matchedProps++;
      }
    });
    if (matchedProps === paramsKeysLen) {
      return value;
    }
    return await this.waitForSpecificPacket(actor, params);
  }

  /**
   * Get the tab object that opened up in the headless browser,
   * that we will use to evaluate against
   *
   * Majority of this code was taken from https://github.com/saucelabs/foxdriver/blob/1f75618f5f815b6d2022117187db1e2ac711c4db/lib/browser.js#L76. Thank you!
   *
   * @returns The tab, holding the actor we use every other request
   */
  private async listTabs(): Promise<Tab> {
    console.log("getting tabs");
    let listTabsResponse =
      (await this.request("listTabs", {}, "root")) as ListTabsResponse;
    // NOTE: When browser isn't ran in headless, there is usually 2 tabs open, the first one being "Advanced Preferences" or "about" page, and the second one being the actual page we navigated to
    let tabs = listTabsResponse.tabs;
    while (
      tabs.length === 0 || (tabs.length > 0 && tabs[0].title === "New Tab")
    ) {
      listTabsResponse =
        (await this.request("listTabs", {}, "root")) as ListTabsResponse;
      tabs = listTabsResponse.tabs;
    }
    console.log("got tabs");
    let tab = listTabsResponse.tabs.find((t) => t.selected === true) as Tab;
    // For firefox > 75 consoleActor is not available within listTabs request
    if (tab && !tab.consoleActor) {
      const tabActorRequest = await this.request("getTarget", {}, tab.actor);
      tab = {
        ...tab,
        ...tabActorRequest.frame,
      };
    }
    return tab;
  }

  /**
   * The main method we use to send requests through the connection we
   * establish with the headless browser.
   *
   * @param type - The request type, eg "navigateTo"
   * @param params - Any extra parameters the request will use. For example, if using `navigateTo`: `await this.request("navigateTo", { url: "https://google.com })`
   * @param actor - As opposed to using the actor for the tab, you can override it with an actor of your choice. This is mainly here so we can use "root" as the actor when listing tabs (see `listTabs`)
   *
   * @returns The response of the request.
   * An object containing the message: This is a parsed JSON response that was assigned to th id, thus the response from thee request
   */
  private async request(
    type: string,
    params = {},
    actor?: string,
    // deno-lint-ignore no-explicit-any
  ): Promise<Record<string, any>> {
    actor = actor ? actor : this.actor;
    // Construct data in required format to send
    const message = {
      type,
      to: actor,
      ...params,
    };
    const str = JSON.stringify(message);
    const encoder = new TextEncoder();
    const encodedMessage = `${(encoder.encode(str)).length}:${str}`;
    // Send message
    console.log(`Sending a request, heres message:`);
    console.log(message);
    await this.conn.write(new TextEncoder().encode(encodedMessage));
    // Get related packet
    let packet;
    while (true) {
      const iterator = this.readPackets();
      const n = await iterator.next();
      packet = n.value;
      // todo these conditionals could probs be moved to readpackets
      // ignore packets that arent related to the actor that sent the message
      if (packet.from !== actor) {
        continue;
      }
      break;
    }
    // Check for errors
    if ("error" in packet) {
      await this.done(`${packet.error}: ${packet.message}`);
    }
    if ("pageError" in packet) {
      await this.done(`${packet.type}: ${packet.errrorMessage}`);
    }
    console.log("Got packet for message:");
    console.log(packet);
    // Return result
    return packet;
  }

  /**
   * Get full path to the firefox binary on the user'ss filesystem.
   * Thanks to [caspervonb](https://github.com/caspervonb/deno-web/blob/master/browser.ts)
   *
   * @returns the path
   */
  private static getFirefoxPath(): string {
    switch (Deno.build.os) {
      case "darwin":
        return "/Applications/Firefox.app/Contents/MacOS/firefox";
      case "linux":
        return "/usr/bin/firefox";
      case "windows":
        return "C:\\Program Files\\Mozilla Firefox\\firefox.exe";
    }
  }
}
