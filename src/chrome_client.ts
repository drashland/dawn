// https://peter.sh/experiments/chromium-command-line-switches/
// https://chromedevtools.github.io/devtools-protocol/tot/Network/

// Success response
// switch (result.result.type) {
//   case "object":
//     console.log('Result is an object')
//     break
//   case "string":
//     console.log("Result is a string")
//     break
//   case "undefined":
//     console.log('Command output returned undefined')
//     break
//   default:
//     throw new Error("Unhandled result type: " + result["result"]["type"])
// }

import { assertEquals, Deferred, deferred, readLines } from "../deps.ts";
import { exists } from "./utility.ts";

interface MessageResponse { // For when we send an event to get one back, eg running a JS expression
  id: number;
  result?: unknown; // Present on success
  error?: unknown; // Present on error
}

interface NotificationResponse { // Not entirely sure when, but when we send the `Network.enable` method
  method: string;
  params: unknown;
}

type SuccessResult = {
  value?: string | boolean; // only present if type is a string or boolean
  type: string; // the type of result that the `value` will be, eg object or string or boolean, ,
  className: string; // eg Location if command is `window.location`, only present when type is object
  description: string; // eg Location if command is `window.location`, only present when type is object
  objectId: string; // only present when type is object, eg '{"injectedScriptId":2,"id":2}'
};

type UndefinedResult = { // not sure when this happens, but i believe it to be when the result of a command is undefined, for example if a command is `window.loction`
  type: string; // undefined
};

type Exception = {
  className: string; // eg SyntaxError
  description: string; // eg SyntaxError: Uncaught identifier
  objectId: string; // only present when type is object, eg '{"injectedScriptId":2,"id":2}'
  subtype: string; // eg error
  type: string; // eg object
};
type ExceptionDetails = { // exists when an error
  columnNumber: number;
  exception: Exception;
  exceptionId: number;
  lineNumber: number;
  scriptId: string; // eg "12"
  text: string; // eg Uncaught
};

type DOMOutput = {
  result: SuccessResult | Exception | UndefinedResult;
  exceptionDetails?: ExceptionDetails; // exists when an error, but an undefined response value wont trigger it, for example if the command is `window.location`, there is no `exceptionDetails` property, but if the command is `window.` (syntax error), this prop will exist
};

const webSocketIsDonePromise = deferred();

export interface BuildOptions {
  debuggerPort?: number; // The port to start the debugger on for Chrome, so that we can connect to it. Defaults to 9292
  defaultUrl?: string; // Default url chrome will open when it is ran. Defaults to "https://chromestatus.com"
  hostname?: string; // The hostname the browser process starts on. If on host machine, this will be "localhost", if in docker, it will bee the container name. Defaults to localhost
  binaryPath?: string; //The Full Path to the browser binary. If using an alternative chromium based browser, this field is necessary.
}

/**
   * Gets the full path to the chrome executable on the users filesystem
   *
   * @returns The path to chrome
   */
export async function getChromePath(): Promise<string> {
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
      if (await exists(paths.windows_chrome_exe)) {
        chromePath = paths.windows_chrome_exe;
        break;
      }
      if (await exists(paths.windows_chrome_exe_x86)) {
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

export class ChromeClient {
  /**
   * The sub process that runs headless chrome
   */
  private readonly browser_process: Deno.Process;

  /**
   * Our web socket connection to the remote debugging port
   */
  private readonly socket: WebSocket;

  /**
   * A counter that acts as the message id we use to send as part of the event data through the websocket
   */
  private next_message_id = 1;
  private frame_id = null;

  /**
   * To keep hold of promises waiting for a notification from the websocket
   */
  private notification_resolvables: { [key: string]: Deferred<void> } = {};

  /**
   * Track if we've closed the sub process, so we dont try close it when it already has been
   */
  private browser_process_closed = false;

  /**
   * To keep hold of our promises waiting for messages from the websocket
   */
  private resolvables: { [key: number]: Deferred<unknown> } = {};

  constructor(socket: WebSocket, browserProcess: Deno.Process) {
    this.socket = socket;
    this.browser_process = browserProcess;
    // Register error listener
    this.socket.onerror = function () {
      webSocketIsDonePromise.resolve();
    };
    // Register on message listenerr
    this.socket.onmessage = (msg) => {
      // 2nd part of the dirty fix 1
      const data = JSON.parse(msg.data);
      if (data.method === "Page.frameStartedLoading") {
        this.frame_id = data.params.frameId;
      }
      if (data.id && data.id === -1) {
        this.socket!.close();
      } else {
        this.handleSocketMessage(msg);
      }
    };
  }

  //////////////////////////////////////////////////////////////////////////////
  // FILE MARKER - METHODS - PUBLIC ////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  public static async build(options: BuildOptions = {}) {
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
    const chromePath = options.binaryPath || await getChromePath();
    const browserProcess = Deno.run({
      cmd: [
        chromePath,
        "--headless",
        "--remote-debugging-port=" + options.debuggerPort,
        "--disable-gpu",
        "--no-sandbox",
        options.defaultUrl,
      ],
      stderr: "piped", // so stuff isn't displayed in the terminal for the user
    });
    // Wait until browser is ready
    for await (
      const line of readLines(browserProcess.stderr)
    ) {
      if (line.indexOf("DevTools listening on ws://") > -1) {
        break;
      }
    }
    // Connect our websocket
    const debugUrl = await this.getWebSocketUrl(
      options.hostname,
      options.debuggerPort,
    );
    const socket = new WebSocket(debugUrl);
    // Wait until its open
    const promise = deferred();
    socket.onopen = function () {
      promise.resolve();
    };
    await promise;
    // Create tmp chrome client and enable page notifications, so we can wait for page events, such as when a page has loaded
    const TempChromeClient = new ChromeClient(socket, browserProcess);
    await TempChromeClient.sendWebSocketMessage("Page.enable");
    // Return the client :)
    return new ChromeClient(socket, browserProcess);
  }

  /**
   * Asserts a given url matches the current
   *
   * @param expectedUrl - The expected url, eg `https://google.com/hello`
   */
  public async assertUrlIs(expectedUrl: string): Promise<void> {
    // There's a whole bunch of other data it responds with, but we only care about documentURL. This data is always present on the response
    const res = await this.sendWebSocketMessage("DOM.getDocument") as {
      root: {
        documentURL: string;
      };
    };
    const actualUrl = res.root.documentURL;
    if (actualUrl !== expectedUrl) { // Before we know the test will fail, close everything
      await this.done();
    }
    assertEquals(actualUrl, expectedUrl);
  }

  /**
   * Check if the given text exists on the dom
   *
   * @param text - The text to check for
   */
  public async assertSee(text: string): Promise<void> {
    const command = `document.body.innerText.indexOf('${text}') >= 0`;
    const res = await this.sendWebSocketMessage("Runtime.evaluate", {
      expression: command,
    }) as { // Tried and tested
      result: {
        type: "boolean";
        value: boolean;
      };
    };
    const exists = res.result.value;
    if (exists !== true) { // We know it's going to fail, so before an assertion error is thrown, cleanup
      await this.done();
    }
    assertEquals(exists, true);
  }

  /**
   * Go to a specific page
   *
   * @param urlToVisit - The page to go to
   */
  public async goTo(urlToVisit: string): Promise<void> {
    const notificationPromise = this
      .notification_resolvables["Page.loadEventFired"] = deferred();
    const res = await this.sendWebSocketMessage("Page.navigate", {
      url: urlToVisit,
    }) as {
      frameId: string;
      loaderId: string;
      errorText?: string; // Only present when an error occurred, eg page doesn't exist
    };
    await notificationPromise;
    if (res.errorText) {
      //await this.done()
      throw new Error(
        `${res.errorText}: Error for navigating to page "${urlToVisit}"`,
      );
    }
  }

  /**
   * Clicks a button with the given selector
   *
   *     await this.click("#username");
   *     await this.click('button[type="submit"]')
   *
   * @param selector - The tag name, id or class
   */
  public async click(selector: string): Promise<void> {
    const command = `document.querySelector('${selector}').click()`;
    const result = await this.sendWebSocketMessage("Runtime.evaluate", {
      expression: command,
    }) as {
      //  If all went ok and an elem was clicked
      result: {
        type: "undefined";
      };
    } | { // else a other error, eg no elem exists with the selector, or `selector` is `">>"`
      result: Exception;
      exceptionDetails: ExceptionDetails;
    };

    // If there's an error, resolve the notification as the page was never changed so we'll never get the response, so to stop hanging, resolve it :)
    if ("exceptionDetails" in result) {
      this.checkForErrorResult(result, command);
    }
  }

  /**
   * Invoke a function or string expression on the current frame.
   *
   * @param pageCommand - The function to be called.
   */
  public async evaluatePage(
    pageCommand: (() => unknown) | string,
  ): Promise<unknown> {
    if (typeof pageCommand === "string") {
      const { result } = await this.sendWebSocketMessage("Runtime.evaluate", {
        expression: pageCommand,
      });
      return result.value;
    }

    if (typeof pageCommand === "function") {
      const { executionContextId } = await this.sendWebSocketMessage(
        "Page.createIsolatedWorld",
        {
          frameId: this.frame_id,
        },
      );

      const { result } = await this.sendWebSocketMessage(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: pageCommand.toString(),
          executionContextId: executionContextId,
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
        },
      );
      return result.value;
    }
  }

  /**
   * Wait for the page to change. Can be used with `click()` if clicking a button or anchor tag that redirects the user
   */
  public async waitForPageChange(): Promise<void> {
    const notificationPromise = this
      .notification_resolvables["Page.loadEventFired"] = deferred();
    await notificationPromise;
    delete this.notification_resolvables["Page.loadEventFired"];
  }

  /**
   * Gets the text for the given selector
   * Must be an input element
   *
   * @param selector - eg input[type="submit"] or #submit
   *
   * @throws When:
   *     - Error with the element (using selector)
   *
   * @returns The text inside the selector, eg could be "" or "Edward"
   */
  public async getInputValue(selector: string): Promise<string> {
    const command = `document.querySelector('${selector}').value`;
    const res = await this.sendWebSocketMessage("Runtime.evaluate", {
      expression: command,
    }) as {
      result: {
        type: "undefined" | "string";
        value?: string;
      };
    } | { // Present if we get a `cannot read property 'value' of null`, eg if `selector` is `input[name="fff']`
      result: Exception;
      exceptionDetails: ExceptionDetails;
    };
    const type = (res as DOMOutput).result.type;
    if (type === "undefined") { // not an input elem
      return "undefined";
    }
    if ("exceptionDetails" in res) {
      this.checkForErrorResult(res, command);
    }
    // Tried and tested, value and type are a string aand `res.result.value` definitely exists at this stage
    const value = (res.result as { value: string }).value;
    return value || "";
  }

  /**
   * Close/stop the sub process, and close the ws connection. Must be called when finished with all your testing
   */
  public async done(errMsg?: string): Promise<void> {
    // [Dirty fix 1] Dirty hack... There is a bug with WS API that causes async ops. I (ed) have found that closing the conn inside the message handler fixes it, which is why we are trigger a message here, so the `onmessage` handler can close the connection
    if (this.socket.readyState !== 3) { // Conditional here, as this method cna be called by the assertion methods, so if an assertion method has failed, and the user calls `.done()`, we wont try close an already close websocket
      const p = deferred();
      this.socket.onclose = function () {
        p.resolve();
      };
      this.socket.send(JSON.stringify({
        id: -1,
        method: "DOM.getDocument", // Can be anything really, we just wanna trigger an event
      }));
      // Then wait for the promise to be resolved when the WS client is done
      await p;
    }
    if (this.browser_process_closed === false) {
      this.browser_process.stderr!.close();
      this.browser_process.close();
      this.browser_process_closed = true;
    }
    if (errMsg) {
      throw new Error(errMsg);
    }
  }

  /**
   * Type into an input element, by the given selector
   *
   *     <input name="city"/>
   *
   *     await this.type('input[name="city"]', "Stockholm")
   *
   * @param selector - The value for the name attribute of the input to type into
   * @param value - The value to set the input to
   */
  public async type(selector: string, value: string): Promise<void> {
    const command = `document.querySelector('${selector}').value = "${value}"`;
    const res = await this.sendWebSocketMessage("Runtime.evaluate", {
      expression: command,
    }) as {
      result: Exception;
      exceptionDetails: ExceptionDetails;
    } | {
      result: {
        type: string;
        value: string;
      };
    };
    if ("exceptionDetails" in res) {
      this.checkForErrorResult(res, command);
    }
  }

  /**
   * Set a cookie for the `url`. Will be passed across 'sessions' based
   * from the `url`
   *
   * @param name - Name of the cookie, eg X-CSRF-TOKEN
   * @param value - Value to assign to the cookie name, eg "some cryptic token"
   * @param url - The domain to assign the cookie to, eg "https://drash.land"
   *
   * @example
   * ```ts
   * await Sinco.setCookie("X-CSRF-TOKEN", "abc123", "https://drash.land")
   * const result = await Sinco.evaluatePage(`document.cookie`) // "X-CSRF-TOKEN=abc123"
   * ```
   */
  public async setCookie(
    name: string,
    value: string,
    url: string,
  ): Promise<void> {
    const res = await this.sendWebSocketMessage("Network.setCookie", {
      name,
      value,
      url,
    }) as ({ // if error response. only encountered when I (ed) tried to send a message without passing in a url prop
      code: number; // eg -32602
      message: string; // eg "At least one of the url or domain needs to be specified"
    } | { // if success response
      success: true;
    });
    if ("success" in res === false && "message" in res) {
      await this.done(res.message);
    }
  }

  /**
   * Wait for anchor navigation. Usually used when typing into an input field
   */
  // public async waitForAnchorChange(): Promise<void> {
  //   const notificationPromise = this
  //     .notification_resolvables["Page.navigatedWithinDocument"] = deferred();
  //   await notificationPromise;
  //   delete this.notification_resolvables["Page.navigatedWithinDocument"];
  // }

  //////////////////////////////////////////////////////////////////////////////
  // FILE MARKER - METHODS - PRIVATE ///////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Gets the websocket url we use to create a ws client with.
   * Requires the headless chrome process to be running, as
   * this is what actually starts the remote debugging url
   *
   * @param hostname - The hostname to fetch from
   * @param port -  The port for the hostname to fetch from
   *
   * @returns The url to connect to
   */
  private static async getWebSocketUrl(hostname: string, port: number) {
    let debugUrl = "";
    while (true) {
      try {
        const res = await fetch(`http://${hostname}:${port}/json/list`);
        const json = await res.json();
        debugUrl = json[0]["webSocketDebuggerUrl"];
        break;
      } catch (_err) {
        // do nothing, loop again until the endpoint is ready
      }
    }
    return debugUrl;
  }

  private handleSocketMessage(msg: MessageEvent) {
    const message: MessageResponse | NotificationResponse = JSON.parse(
      msg.data,
    );
    if ("id" in message) { // message response
      const resolvable = this.resolvables[message.id];
      if (resolvable) {
        if ("result" in message) { // success response
          resolvable.resolve(message.result);
        }
        if ("error" in message) { // error response
          resolvable.resolve(message.error);
        }
      }
    }
    if ("method" in message) { // Notification response
      const resolvable = this.notification_resolvables[message.method];
      if (resolvable) {
        resolvable.resolve();
      }
    }
  }

  /**
   * NOT FOR PUBLIC USE
   *
   * Main method to handle sending messages/events to the websocket endpoint.
   *
   * @param method - Any DOMAIN, see sidebar at https://chromedevtools.github.io/devtools-protocol/tot/, eg Runtime.evaluate, or DOM.getDocument
   * @param params - Parameters required for the domain method
   *
   * @returns
   */
  private async sendWebSocketMessage(
    method: string,
    params?: { [key: string]: unknown },
    // deno-lint-ignore no-explicit-any The return value could literally be anything
  ): Promise<any> {
    const data: {
      id: number;
      method: string;
      params?: { [key: string]: unknown };
    } = {
      id: this.next_message_id++,
      method: method,
    };
    if (params) data.params = params;
    const messagePromise = this.resolvables[data.id] = deferred();
    this.socket.send(JSON.stringify(data));
    const result = await messagePromise;
    delete this.resolvables[data.id];
    return result;
  }

  /**
   * Checks if the result is an error
   *
   * @param result - The DOM result response, after writing to stdin and getting by stdout of the process
   * @param commandSent - The command sent to trigger the result
   */
  private checkForErrorResult(result: DOMOutput, commandSent: string): void {
    // Is an error
    if (result.exceptionDetails) { // Error with the sent command, maybe there is a syntax error
      const exceptionDetail = result.exceptionDetails;
      const errorMessage = exceptionDetail.exception.description;
      if (errorMessage.includes("SyntaxError")) { // a syntax error
        const message = errorMessage.replace("SyntaxError: ", "");
        throw new SyntaxError(message + ": `" + commandSent + "`");
      } else { // any others, unsure what they'd be
        throw new Error(`${errorMessage}: "${commandSent}"`);
      }
    }
  }
}
