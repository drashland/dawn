import { assertEquals } from "../../deps.ts";
import {ChromeClient} from "../../mod.ts";

Deno.test("Get and set input value - Tutorial for this feature in the docs should work", async () => {
  const Sinco = await ChromeClient.build();
  await Sinco.goTo("https://chromestatus.com");
  await Sinco.type('input[placeholder="Filter"]', "hello world");
  const val = await Sinco.getInputValue('input[placeholder="Filter"]');
  assertEquals(val, "hello world");
  await Sinco.done();
});
