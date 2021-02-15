import { ChromeClient } from "../../mod.ts";

Deno.test("Waiting - Tutorial for this feature in the docs should work", async () => {
  const Sinco = await ChromeClient.build();
  await Sinco.goTo("https://chromestatus.com");
  await Sinco.assertUrlIs("https://chromestatus.com/features");
  await Sinco.type('input[placeholder="Filter"]', "Hello");
  await Sinco.waitForAnchorChange();
  await Sinco.assertUrlIs("https://chromestatus.com/features#Hello");
  await Sinco.click('a[href="/features/schedule"]');
  await Sinco.waitForPageChange();
  await Sinco.assertUrlIs("https://chromestatus.com/features/schedule");
  await Sinco.done();
});
