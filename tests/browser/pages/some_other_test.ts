import { HeadlessBrowser } from "../../../mod.ts";
import { assertEquals } from "https://deno.land/std@0.78.0/testing/asserts.ts";

Deno.test("Displays the main video on page enter", async () => {
  // Setup
  const Sinco = new HeadlessBrowser();
  await Sinco.build(); // Creates the headless browser
  await Sinco.goTo("https://chromestatus.com"); // Go to this page
  // Do any actions and assertions, in any order
  await Sinco.assertUrlIs("https://chromestatus.com/features");
  await Sinco.type('input[placeholder="Filter"]', "Hello");
  await Sinco.waitForAnchorChange();
  await Sinco.assertUrlIs("https://chromestatus.com/features#Hello");
  await Sinco.type('a[href="/features"]', "yamum");
  await Sinco.goTo("https://google.com")
  await Sinco.done();
});

Deno.test("Can add a comemnt to the video", async () => {
  // Setup
  const Sinco = new HeadlessBrowser();
  await Sinco.build(); // Creates the headless browser
  await Sinco.goTo("https://chromestatus.com"); // Go to this page
  // Do any actions and assertions, in any order
  await Sinco.assertUrlIs("https://chromestatus.com/featuresIDONTEXISTSOIWILLFAIL");
  await Sinco.type('input[placeholder="Filter"]', "Hello");
  await Sinco.waitForAnchorChange();
  await Sinco.assertUrlIs("https://chromestatus.com/features#Hello");
  await Sinco.type('a[href="/features"]', "yamum");
  await Sinco.goTo("https://google.com")
  await Sinco.done();
});

Deno.test("Can delete a comment for the video", async () => {
  // Setup
  const Sinco = new HeadlessBrowser();
  await Sinco.build(); // Creates the headless browser
  await Sinco.goTo("https://chromestatus.com"); // Go to this page
  // Do any actions and assertions, in any order
  await Sinco.assertUrlIs("https://chromestatus.com/features#heheheeh");
  await Sinco.type('input[placeholder="Filter"]', "Hello");
  await Sinco.waitForAnchorChange();
  await Sinco.assertUrlIs("https://chromestatus.com/features#Hello");
  await Sinco.type('a[href="/features"]', "yamum");
  await Sinco.goTo("https://google.com")
  await Sinco.done();
});