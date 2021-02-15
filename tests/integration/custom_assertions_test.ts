import {ChromeClient} from "../../mod.ts";

Deno.test("Assertions - Tutorial for this feature in the docs should work", async () => {
  const Sinco = await ChromeClient.build();
  await Sinco.goTo("https://chromestatus.com");
  await Sinco.assertUrlIs("https://chromestatus.com/features");
  await Sinco.assertSee("Chrome versions");
  await Sinco.done();
});
