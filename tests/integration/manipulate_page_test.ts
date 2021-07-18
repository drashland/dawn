import { assertEquals } from "../../deps.ts";
import { ChromeClient, FirefoxClient } from "../../mod.ts";

Deno.test("Chrome: Manipulate Webpage", async () => {
  const Sinco = await ChromeClient.build();
  await Sinco.goTo("https://chromestatus.com");

  const updatedBody = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    const prevBody = document.body.children.length;
    // deno-lint-ignore no-undef
    const newEl = document.createElement("p");
    // deno-lint-ignore no-undef
    document.body.appendChild(newEl);
    // deno-lint-ignore no-undef
    return prevBody === document.body.children.length - 1;
  });
  assertEquals(updatedBody, true);

  await Sinco.done();
});

Deno.test("Chrome: Evaluating a script - Tutorial for this feature in the documentation works", async () => {
  const Sinco = await ChromeClient.build();
  await Sinco.goTo("https://drash.land");
  const pageTitle = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    return document.title;
  });
  const sum = await Sinco.evaluatePage(`1 + 10`);
  const oldBodyLength = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    return document.body.children.length;
  });
  const newBodyLength = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    const p = document.createElement("p");
    p.textContent = "Hello world!";
    // deno-lint-ignore no-undef
    document.body.appendChild(p);
    // deno-lint-ignore no-undef
    return document.body.children.length;
  });
  await Sinco.done();
  assertEquals(pageTitle, "Drash Land");
  assertEquals(sum, 11);
  assertEquals(oldBodyLength, 14);
  assertEquals(newBodyLength, 15);
});

Deno.test("Firefox: Manipulate Webpage", async () => {
  const Sinco = await FirefoxClient.build();
  await Sinco.goTo("https://chromestatus.com");

  const updatedBody = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    const prevBody = document.body.children.length;
    // deno-lint-ignore no-undef
    const newEl = document.createElement("p");
    // deno-lint-ignore no-undef
    document.body.appendChild(newEl);
    // deno-lint-ignore no-undef
    return prevBody === document.body.children.length - 1;
  });
  await Sinco.done();
  assertEquals(updatedBody, true);
});

Deno.test("Firefox: Evaluating a script - Tutorial for this feature in the documentation works", async () => {
  const Sinco = await FirefoxClient.build();
  await Sinco.goTo("https://drash.land");
  const pageTitle = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    return document.title;
  });
  const sum = await Sinco.evaluatePage(`1 + 10`);
  const oldBodyLength = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    return document.body.children.length;
  });
  const newBodyLength = await Sinco.evaluatePage(() => {
    // deno-lint-ignore no-undef
    const p = document.createElement("p");
    p.textContent = "Hello world!";
    // deno-lint-ignore no-undef
    document.body.appendChild(p);
    // deno-lint-ignore no-undef
    return document.body.children.length;
  });
  await Sinco.done();
  assertEquals(pageTitle, "Drash Land");
  assertEquals(sum, 11);
  assertEquals(oldBodyLength, 14);
  assertEquals(newBodyLength, 15);
});
