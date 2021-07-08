import { Rhum } from "../deps.ts";
import { FirefoxClient } from "../../mod.ts";
import {
  defaultBuildOptions,
  getFirefoxPath,
} from "../../src/firefox_client.ts";

Rhum.testPlan("tests/unit/firefox_client_test.ts", () => {
  Rhum.testSuite("build()", () => {
    Rhum.testCase("Will start firefox headless as a subprocess", async () => {
      const Sinco = await FirefoxClient.build();
      // If it hasn't, connecting will throw an error
      const conn = await Deno.connect({
        hostname: defaultBuildOptions.hostname,
        port: defaultBuildOptions.debuggerServerPort,
      });
      conn.close();
      await Sinco.done();
    });
    Rhum.testCase(
      "Uses the port when passed in to the parameters",
      async () => {
        const Sinco = await FirefoxClient.build({
          debuggerServerPort: 9999,
        });
        const conn = await Deno.connect({
          hostname: defaultBuildOptions.hostname,
          port: 9999,
        });
        conn.close();
        await Sinco.done();
      },
    );
    Rhum.testCase("Uses the url when passed in to the parameters", async () => {
      const Sinco = await FirefoxClient.build({
        defaultUrl: "https://drash.land",
      });
      await Sinco.assertUrlIs("https://drash.land/");
      await Sinco.done();
    });
    Rhum.testCase(
      "Uses the hostname when passed in to the parameters",
      async () => {
        // Unable to test properly, as windows doesnt like 0.0.0.0 or localhost, so the only choice is 127.0.0.1 but this is already the default
      },
    );
    Rhum.testCase(
      "Uses the binaryPath when passed in to the parameters",
      async () => {
        const Sinco = await FirefoxClient.build({
          binaryPath: getFirefoxPath(),
        });
        // If it hasn't, connecting will throw an error
        const conn = await Deno.connect({
          hostname: defaultBuildOptions.hostname,
          port: defaultBuildOptions.debuggerServerPort,
        });
        conn.close();
        await Sinco.done();
      },
    );
  });

  Rhum.testSuite("assertUrlIs()", () => {
    Rhum.testCase("Works when an assertion is true", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com/features");
      await Sinco.assertUrlIs("https://chromestatus.com/features");
      await Sinco.done();
    });
    Rhum.testCase("Will fail when an assertion fails", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com");
      let originalErrMsg = "";
      try {
        await Sinco.assertUrlIs("https://hella.com");
      } catch (error) {
        originalErrMsg = error.message;
      }
      await Sinco.done();
      const msgArr = originalErrMsg.split("\n").filter((line) => {
        return !!line === true && line.indexOf(" ") !== 0 &&
          line.indexOf("Values") < 0;
      });
      Rhum.asserts.assertEquals(
        msgArr[0],
        "\x1b[31m\x1b[1m-   https://\x1b[41m\x1b[37mchromestatus\x1b[31m\x1b[49m.com\x1b[41m\x1b[37m/\x1b[31m\x1b[49m\x1b[41m\x1b[37mfeatures\x1b[31m\x1b[49m",
      );
      Rhum.asserts.assertEquals(
        msgArr[1],
        "\x1b[22m\x1b[39m\x1b[32m\x1b[1m+   https://\x1b[42m\x1b[37mhella\x1b[32m\x1b[49m.com",
      );
    });
  });

  Rhum.testSuite("setCookie()", () => {
    Rhum.testCase("Should set the cookie value correctly", async () => {
      // Covered in integration tests
    });
  });

  Rhum.testSuite("goto()", () => {
    Rhum.testCase("Successfully navigates when url is correct", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com/features/schedule");
      await Sinco.assertUrlIs("https://chromestatus.com/features/schedule");
      await Sinco.done();
    });
    Rhum.testCase(
      "Throws an error when there was an error navving to the page",
      async () => {
        const Sinco = await FirefoxClient.build();
        let msg = "";
        try {
          await Sinco.goTo(
            "https://hellaDOCSWOWThispagesurelycantexist.biscuit",
          );
        } catch (err) {
          msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(
          msg,
          'net::ERR_NAME_NOT_RESOLVED: Error for navigating to page "https://hellaDOCSWOWThispagesurelycantexist.biscuit"',
        );
      },
    );
  });

  Rhum.testSuite("assertSee()", () => {
    Rhum.testCase(
      "Assertion should work when text is present on page",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com/features");
        await Sinco.assertSee("Chrome Platform Status");
        await Sinco.done();
      },
    );
    Rhum.testCase(
      "Assertion should NOT work when text is NOT present on page",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        let errorMsg = "";
        try {
          await Sinco.assertSee("Crumpets and tea init?");
        } catch (err) {
          errorMsg = err.message;
        }
        await Sinco.done();
        const msgArr = errorMsg.split("\n").filter((line) => {
          return !!line === true && line.indexOf(" ") !== 0 &&
            line.indexOf("Values") < 0;
        });
        Rhum.asserts.assertEquals(msgArr[0].indexOf("-   false") > -1, true);
        Rhum.asserts.assertEquals(msgArr[1].indexOf("+   true") > -1, true);
      },
    );
  });

  Rhum.testSuite("click()", () => {
    Rhum.testCase("It should allow clicking of elements", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com");
      await Sinco.click('a[href="/features/schedule"]');
      await Sinco.waitForPageChange();
      await Sinco.assertSee("Release timeline");
      await Sinco.done();
    });
    Rhum.testCase(
      "It should throw an error when there is a syntax error",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const error = {
          errored: false,
          msg: "",
        };
        try {
          await Sinco.click("q;q");
        } catch (err) {
          error.errored = true;
          error.msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(error, {
          errored: true,
          msg:
            "DOMException: Document.querySelector: 'q;q' is not a valid selector",
        });
      },
    );
    Rhum.testCase(
      "It should throw an error when no element exists for the selector",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const error = {
          errored: false,
          msg: "",
        };
        try {
          await Sinco.click("a#dont-exist");
        } catch (err) {
          error.errored = true;
          error.msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(error, {
          errored: true,
          msg: `Error: document.querySelector(...) is null`,
        });
      },
    );
  });

  Rhum.testSuite("evaluatePage()", () => {
    Rhum.testCase("It should evaluate function on current frame", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://drash.land");
      const pageTitle = await Sinco.evaluatePage(() => {
        // deno-lint-ignore no-undef
        return document.title;
      });
      await Sinco.done();
      Rhum.asserts.assertEquals(pageTitle, "Drash Land");
    });
    Rhum.testCase("It should evaluate string on current frame", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com");
      const parentConstructor = await Sinco.evaluatePage(`1 + 2`);
      await Sinco.done();
      Rhum.asserts.assertEquals(parentConstructor, 3);
    });
  });

  Rhum.testSuite("getInputValue()", () => {
    Rhum.testCase(
      "It should get the value for the given input element",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        await Sinco.type('input[placeholder="Filter"]', "hello world");
        const val = await Sinco.getInputValue('input[placeholder="Filter"]');
        Rhum.asserts.assertEquals(val, "hello world");
        await Sinco.done();
      },
    );
    Rhum.testCase(
      "It should throw an error when there is a syntax error",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const error = {
          errored: false,
          msg: "",
        };
        try {
          await Sinco.getInputValue("q;q");
        } catch (err) {
          error.errored = true;
          error.msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(error, {
          errored: true,
          msg:
            `DOMException: Document.querySelector: 'q;q' is not a valid selector`,
        });
      },
    );
    Rhum.testCase(
      "It should throw an error when no element exists for the selector",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const error = {
          errored: false,
          msg: "",
        };
        try {
          await Sinco.getInputValue('input[name="dontexist"]');
        } catch (err) {
          error.errored = true;
          error.msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(error, {
          errored: true,
          msg: `Error: document.querySelector(...) is null`,
        });
      },
    );
    Rhum.testCase(
      "Should return undefined when element is not an input element",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const val = await Sinco.getInputValue('a[href="/features/schedule"]');
        await Sinco.done();
        Rhum.asserts.assertEquals(val, "undefined");
      },
    );
  });

  Rhum.testSuite("type()", () => {
    Rhum.testCase("It should set the value of the element", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com");
      await Sinco.type('input[placeholder="Filter"]', "hello world");
      const val = await Sinco.getInputValue('input[placeholder="Filter"]');
      await Sinco.done();
      Rhum.asserts.assertEquals(val, "hello world");
    });
    Rhum.testCase(
      "It should throw an error when there is a syntax error",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const error = {
          errored: false,
          msg: "",
        };
        try {
          await Sinco.type("q;q", "hello");
        } catch (err) {
          error.errored = true;
          error.msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(error, {
          errored: true,
          msg:
            `DOMException: Document.querySelector: 'q;q' is not a valid selector`,
        });
      },
    );
    Rhum.testCase(
      "It should throw an error when no element exists for the selector",
      async () => {
        const Sinco = await FirefoxClient.build();
        await Sinco.goTo("https://chromestatus.com");
        const error = {
          errored: false,
          msg: "",
        };
        try {
          await Sinco.type("input#dont-exist", "qaloo");
        } catch (err) {
          error.errored = true;
          error.msg = err.message;
        }
        await Sinco.done();
        Rhum.asserts.assertEquals(error, {
          errored: true,
          msg: `Error: document.querySelector(...) is null`,
        });
      },
    );
  });

  Rhum.testSuite("done()", () => {
    Rhum.testCase(
      "Should close the sub process eg pid on users machine",
      async () => {
        // TODO(any): How do we do this? We could return the browser process rid and pid in the done() method, but what can we do with it? Eg checking `ps -a`, should not have the process process once we call `done()`
      },
    );
  });

  Rhum.testSuite("waitForPageChange()", () => {
    Rhum.testCase("Waits for a page to change before continuing", async () => {
      const Sinco = await FirefoxClient.build();
      await Sinco.goTo("https://chromestatus.com");
      await Sinco.assertUrlIs("https://chromestatus.com/features");
      await Sinco.click('a[href="/features/schedule"]');
      await Sinco.waitForPageChange();
      await Sinco.assertUrlIs("https://chromestatus.com/features/schedule");
      await Sinco.done();
    });
  });

  // Rhum.testSuite("waitForAnchorChange()", () => {
  //   Rhum.testCase("Waits for any anchor changes after an action", async () => {
  //     const Sinco = await FirefoxClient.build();
  //     await Sinco.goTo("https://chromestatus.com");
  //     await Sinco.type('input[placeholder="Filter"]', "Gday");
  //     await Sinco.waitForAnchorChange();
  //     await Sinco.assertUrlIs("https://chromestatus.com/features#Gday");
  //     await Sinco.done();
  //   });
  // });
});

Rhum.run();
