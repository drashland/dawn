/**
 * Prerequisites
 *
 * 1. Create a test profile:
 *
 *    // /tmp/firefox_dev_profile/prefs.js
 *    user_pref("devtools.chrome.enabled", true);
 *    user_pref("devtools.debugger.prompt-connection", false);
 *    user_pref("devtools.debugger.remote-enabled", true);
 *
 * 2. Create headless browser:
 *
 *    /Applications/Firefox.app/Contents/MacOS/firefox --start-debugger-server 9293 --profile /tmp/firefox_dev_profile https://chromestatus.com
 */

import { Buffer } from "../deps.ts"

interface Message {
  type: string // seems to be the domain, eg navigateTo,
  to:  string // actor name
  [key: string]: string // extra data i believe such as `url`
}

interface Tab {
  actor: string // eg "server1.conn18.tabDescriptor1",
  browserContextID: null | number,
  isZombieTab: boolean,
  outerWindowId: "" | number,
  selected: boolean, // If this is the web page we are viewing
  title: string // Title of the web page
  traits: {
    watcher: boolean
  },
  url: "" | string // eg "https://chromestatus.com/features"
  consoleActor?: unknown // only present on firefox < 76
  frame?: unknown
}

interface ListTabsResponse {
  tabs: Array<Tab>
}

async function simplifiedFirefoxExample () {
  async function connect(): Promise<Deno.Conn> {
    const conn = await Deno.connect({
      hostname: "0.0.0.0",
      port: 9293
    })
    return conn
  }

  const conn = await connect()
  const iter = Deno.iter(conn)
  await iter.next() // get 'welcome' message out the way

  async function request(type: string, params = {}, name: string): Promise<{
    id: number,
    message: Record<string, any>
  }> {
    // Construct data in required format to send
    const message: Message = {
      type,
      to: name,
      ...params
    }
    const str = JSON.stringify(message)
    const encodedMessage = `${(Buffer.from(str)).length}:${str}`
    // Send message
    await conn.write(new TextEncoder().encode(encodedMessage))
    // Receive the response
    const result = await iter.next()
    const value = result.value
    const decodedValue = new TextDecoder().decode(value) // eg `decodedValue` = `123: { ... }` or `92: { ... }`
    const colonIndex = decodedValue.indexOf(":");
    const id = Number(decodedValue.substr(0, colonIndex))
    const jsonString = decodedValue.substr(colonIndex + 1)
    const parsedJson = JSON.parse(jsonString)
    return {
      id,
      message: parsedJson
    }
  }

  // Majority of this code was taken from https://github.com/saucelabs/foxdriver/blob/1f75618f5f815b6d2022117187db1e2ac711c4db/lib/browser.js#L76. Thank you!
  async function listTabs(): Promise<Array<Tab>> {
    let listTabsResponse = (await request("listTabs", {}, "root")).message as ListTabsResponse
    // NOTE: When browser isn't ran in headless, there is usually 2 tabs open, the first one being "Advanced Preferences" or "about" page, and the second one being the actual page we navigated to
    if (!listTabsResponse.tabs) {
      // Sometimes the browser is failing to retrieve the list of tabs, this is a retry
      listTabsResponse = (await request("listTabs", {}, "root")).message as ListTabsResponse
    }
    /**
     * For firefox > 75 consoleActor is not available within listTabs request
     */
    if (listTabsResponse.tabs.length && !listTabsResponse.tabs[0].consoleActor) {
      const tabActorsRequests = listTabsResponse.tabs.map(({actor}) => {
        return request("getTarget", {}, actor)
      })
      const tabActors = await Promise.all(tabActorsRequests)
      const tabs = listTabsResponse.tabs.map((tab, index) => ({
        ...tab,
        ...(tabActors[index] ? tabActors[index].message.frame : null)
      }))
      listTabsResponse.tabs = tabs
    }
    //this.setActors(listTabsResponse)
    // listTabsResponse const tabList = await Promise.all(listTabsResponse.tabs.map(async (tab) => {
    //    if (this.cachedTabs.has(tab.actor)) {
    //      return this.cachedTabs.get(tab.actor)
    //    }
    //    let newTab = new Tab(this.client, tab.actor, tab)
    //    this.cachedTabs.set(tab.actor, newTab)
    //    return newTab
    //  }))
    //  this._cleanCache(listTabsResponse.tabs.map(tab => tab.actor))
    return listTabsResponse.tabs
  }

  const tabs = await listTabs()
  console.log(tabs)
  const  a = await request("navigateTo", {url: "https://chromestatus.com"}, tabs[1].actor)
  console.log(a)
}

export interface BuildOptions {
  hostname?: string, // Hostname for our connection to connect to. Can be "0.0.0.0" or "your_container_name"
  debuggerServerPort?: number, // Port for the debug server to listen on, which our connection will connect to
  defaultUrl?: string // The default url the browser will open when ran
}

/**
 * @example
 *
 *     const Firefox = await FirefoxClient.build()
 *     await Firefox.<api_method>
 */
class FirefoxClient {
  private readonly conn: Deno.Conn

  private readonly iter: AsyncIterableIterator<Uint8Array>

  private readonly browser_process: Deno.Process

  private readonly actor: string

  /**
   * @param conn - The established connection object
   * @param iter - An iterator of `conn`
   * @param browserProcess - The running sub process for the browser
   * @param actor - The actor used to make requests eg the tab name we run actions on
   */
  constructor(conn: Deno.Conn, iter: AsyncIterableIterator<Uint8Array>, browserProcess: Deno.Process, actor: string) {
    this.conn = conn
    this.iter = iter
    this.browser_process = browserProcess
    this.actor = actor
  }

  /**
   * Entry point for creating a headless firefox browser.
   * Creates a dev profile to be used by Firefox, creates the headless browser and sets up the connection to
   *
   * @param buildOptions - Any extra options you wish to provide to customise how the headless browser sub process is ran
   *   - hostname: Defaults to 0.0.0.0
   *   - port: Defaults to 9293
   *   - url: Defaults to https://developer.mozilla.org/
   *
   * @returns An instance of FirefoxClient, that is now ready.
   */
  public static async build (buildOptions: BuildOptions = {}):  Promise<FirefoxClient> {
    // Setup the options to defaults if required
    if (!buildOptions.hostname) {
      buildOptions.hostname = "0.0.0.0"
    }
    if (!buildOptions.debuggerServerPort) {
      buildOptions.debuggerServerPort = 9293
    }
    if (!buildOptions.defaultUrl) {
      buildOptions.defaultUrl = "https://developer.mozilla.org/"
    }
    // Create the profile the browser will use. Create a test one so we can enable required options to enable communication with it
    const tmpDirName = await Deno.makeTempDir()
    const devProfilePath = tmpDirName + "/prefs.js"
    await Deno.writeFile(devProfilePath, new TextEncoder().encode(
        'user_pref("devtools.chrome.enabled", true);' + "\n" +
        'user_pref("devtools.debugger.prompt-connection", false);' + "\n" +
        'user_pref("devtools.debugger.remote-enabled", true);'
    ))
    // Get the path to the users firefox binary TODO :: Support windows and linux
    const firefoxPath = "/Applications/Firefox.app/Contents/MacOS/firefox"
    // Create the arguments we will use when spawning the headless browser
    const args = [
      "--start-debugger-server", // todo :: only needs 1ddash for windows?
      buildOptions.debuggerServerPort.toString(),
      "--profile", // todo :: only needs 1ddash for windows?
      tmpDirName,
      //"--headless", // todo :: only needs 1ddash for windows?
      buildOptions.defaultUrl
    ]
    // Create the sub process to start the browser
    // TODO FIXME TODO FIXME START HERE :: There seems to be an error when we run this, i think maybe the proces hasnt startedd because if we remove all the sub process code and do it manually from the cli, it works
    const browserProcess = Deno.run({
      cmd: [firefoxPath, ...args],
      stderr: "piped",
      stdout: "piped"
    })
    // Wait a few seconds for it to start
    const p = new Promise(resolve => {
      setTimeout(() => {
        resolve("")
      }, 3000)
    })
    await p
    // Connect
    const conn = await Deno.connect({
      hostname: "0.0.0.0",
      port: 9293
    })
    const iter = Deno.iter(conn)
    await iter.next() // get 'welcome' message out the way
    // Get actor (tab) that we use to interact with
    const TempFirefoxClient = new FirefoxClient(conn, iter, browserProcess,"root") // "root" required as the "to" when we send a request to get tabs
    const tab = await TempFirefoxClient.listTabs()
    const actor = tab.actor
    // Return the client :)
    return new FirefoxClient(conn, iter, browserProcess, actor)
  }

  /**
   * Navigate to a URL of your choice
   *
   * @param url - The full url, eg "https://google.com"
   */
  public async navigateTo(url: string): Promise<void> {
     await this.request("navigateTo", { url })
    // We don't return anything here, because the response data is nothing useful, for example we get the following: `{ id: 44, message: { from: "server1.conn0.child4/frameTarget1" } }`
  }

  /**
   * Close all connections with the browser, and stop the sub process
   */
  public async done(): Promise<void> {
    try {
      this.conn.close()
      this.browser_process.stderr.close();
      this.browser_process.stdout.close()
      this.browser_process.close();
    } catch (err) {
      // ... do nothing
    }
  }

  /**
   * NOT FOR PUBLIC USE.
   *
   * Get the tab object that opened up in the headless browser,
   * that we will use to evaluate against
   *
   * Majority of this code was taken from https://github.com/saucelabs/foxdriver/blob/1f75618f5f815b6d2022117187db1e2ac711c4db/lib/browser.js#L76. Thank you!
   *
   * @returns The tab, holding the actor we use every other request
   */
  public async listTabs (): Promise<Tab> {
    let listTabsResponse = (await this.request("listTabs", {}, "root")).message as ListTabsResponse
    // NOTE: When browser isn't ran in headless, there is usually 2 tabs open, the first one being "Advanced Preferences" or "about" page, and the second one being the actual page we navigated to
    if (!listTabsResponse.tabs) {
      // Sometimes the browser is failing to retrieve the list of tabs, this is a retry
      listTabsResponse = (await this.request("listTabs", {}, "root")).message as ListTabsResponse
    }
    let tab = listTabsResponse.tabs.find(t => t.selected === true) as Tab
    // For firefox > 75 consoleActor is not available within listTabs request
    if (tab && !tab.consoleActor) {
      const tabActorRequest = await this.request("getTarget", {}, tab.actor)
      tab = {
        ...tab,
        ...tabActorRequest.message.frame
      }
    }
    return tab
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
   * An object containing:
   *   - id: Unsure what this corresponds to
   *   - message: This is a parsed JSON response that was assigned to th id, thus the response from thee request
   */
  private async request (type: string, params = {}, actor?: string): Promise<{
    id: number,
    message: Record<string, any>
  }> {
    // Construct data in required format to send
    const message: Message = {
      type,
      to: actor ? actor : this.actor,
      ...params
    }
    const str = JSON.stringify(message)
    const encodedMessage = `${(Buffer.from(str)).length}:${str}`
    // Send message
    await this.conn.write(new TextEncoder().encode(encodedMessage))
    // Receive the response
    const result = await this.iter.next()
    const value = result.value
    const decodedValue = new TextDecoder().decode(value) // eg `decodedValue` = `123: { ... }` or `92: { ... }`
    const colonIndex = decodedValue.indexOf(":");
    const id = Number(decodedValue.substr(0, colonIndex))
    const jsonString = decodedValue.substr(colonIndex + 1)
    const parsedJson = JSON.parse(jsonString)
    // Check for errors
    if ("error" in parsedJson) {
      throw new Error(`${parsedJson.error}:  ${parsedJson.message}`)
    }
    // Return result
    return {
      id,
      message: parsedJson
    }
  }
}

const Firefox = await FirefoxClient.build()
//console.log(await Firefox.navigateTo("https://google.com"))

