import { CliService } from "../deps.ts";
import { version } from "./version.ts";

export const helpMessage = CliService.createHelpMenu({
  description: `A browser testing and automation tool.`,
  usage: [
    `deno install --allow-net --allow-read --allow-write --allow-env --unstable --allow-plugin https://deno.land/x/sinco@v${version}/cli.ts`,
    `sinco [SUBCOMMAND]`,
  ],
  subcommands: {
    "open":
        "Opens the Sinco GUI application ",
    "help, --help": "Prints the help message",
    "version, --version": "Prints the current Sinco version",
  },
  example_usage: [
    {
      description: "Open the GUI",
      examples: [
        `sinco open`,
      ],
    },
  ],
});