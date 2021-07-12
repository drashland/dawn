/**
 * deno run --unstable --allow-env --allow-read --allow-write --allow-net --allow-plugin
 */

import {CliService} from "./cli/deps.ts";
import {open} from "./cli/commands/open.ts";
import {helpMessage} from "./cli/commands/help.ts";
import {version} from "./cli/commands/version.ts";

const c = new CliService(Deno.args);

c.addSubcommand(["help", "--help"], () => {
  console.log(helpMessage);
});

c.addSubcommand(["version", "--version"], () => {
  console.log(`Sinco ${version}`);
});

c.addSubcommand("open", async (args: string[]) => {
  await open();
});

c.run()

// TODO :: add > Run again button to header, add loading component for sidebar when running tests, add bug report button