import { Server, Packet } from "https://deno.land/x/wocket/mod.ts"
import {readLines} from "../../deps.ts";

export const socket = new Server()

// Open channels
socket.on("test-success", (data: Packet) => {})
socket.on("test-failure", (data: Packet) => {})
socket.on("new-debug-url", (data: Packet) => {})
socket.on("test-case-failure-result", (data: Packet) => {})

async function emitNewDebugUrl () {
  let debugUrl = "";
  let count = 0
  while (true) {
    count++
    try {
      const headlessRes = await fetch("http://localhost:9292/json/list")
      const jsonRes = await headlessRes.json()
      debugUrl = "http://localhost:9292" + jsonRes[0]["devtoolsFrontendUrl"]
      break
    } catch (err) {
    }
    if (count > 1000) {
      break
    }
  }
  socket.to("new-debug-url", {
    wsUrl: debugUrl
  })
}


// TODO :: Somewhere, get the failures stdout when test finished (only displays when testing is finished) then pass it  back to  the client, and the client will display the assertion errors under the respective test case

async function processStdout (p: Deno.Process, filename: string) {
  let testRunFailed = false;
  let failuresOutput: string[] = []
  const failedTestCaseNames: string[] = []
  for await (const line of readLines(p.stdout!)) {
    console.log('stdout: ' + line)
    if (line.indexOf("test") === 0 && line.indexOf(" ... ") > -1) { // running a test case. the  name and result
      const testName = line
          .slice(5) // remove "test "
          .split(" ... ")[0]
      if (line.indexOf("FAILED") > -1) { // test case failed
        failedTestCaseNames.push(testName)
        console.log('sending ets failure evt')
        socket.to("test-failure", {
          testName,
          testCase: true,
          filename,
          testFinished: false,
          testResult: null
        })
      } else if (line.indexOf("ok") > -1 && line.indexOf("test ") === 0) { // test case passed
        socket.to("test-success", {
          testName,
          testCase: true,
          filename,
          testFinished: false,
          testResult: null
        })
      }
      emitNewDebugUrl() // Because each test case is a new sinco instance, we need to change the debug url to reflect the new test
    }
    if (line.indexOf("test result: ") > -1) { // when all tests are done. the test results
      const testResult = line.split(/test result: .*\. /)[1].split(";")
      const passed =  testResult[0].split(" passed")[0]
      const failed = testResult[1].split(" failed")[0]
      socket.to("test-success", {
        testName: "",
        testCase: false,
        filename,
        testFinished: true,
        testResult: {
          passed,
          failed
        }
      })
    } else if (line === "failures:") { // to tell this function we have reached  the 'failures' block
      if (testRunFailed === false) {
        testRunFailed = true
      }
    } else if (testRunFailed) { // collate  the output so we can easily send it
      if (line === "" ||  line === "\n") {
        continue
      }
      failuresOutput.push(line)
    }
  }
  if (testRunFailed && failuresOutput.length) {
    const failureOutputStr: string  = failuresOutput.join("\n").split(/failures:/)[0];
    failedTestCaseNames.forEach((name, i) => {
      if (i + 1 === failedTestCaseNames.length) {
        // TODO :: Just need to display this on the client now.. the client gets the message, just needs to add html
        // for the last test case
        const singleTestCaseArr = failureOutputStr
            .substr(failureOutputStr.indexOf(name), failureOutputStr.lastIndexOf(failedTestCaseNames[0]))
            .replace(/\[.*m/g, "")
            .replace(/\\u1b/g, "")
            .replace(/\x1b/g, "")
            .split("\n") // So we can loop through on the client
            .filter(str => str.trim() !== "")
        singleTestCaseArr.shift() // Removes the test case name as we dont need it
        socket.to("test-case-failure-result", {
          message:  singleTestCaseArr,
          testCaseName: name
        })
      } else {
        const singleTestCaseArr = failureOutputStr
            .substr(failureOutputStr.indexOf(name), failureOutputStr.indexOf(failedTestCaseNames[i + 1]))
            .replace(/\[.*m/g, "")
            .replace(/\\u1b/g, "")
            .replace(/\x1b/g, "")
            .split("\n") // So we can loop through on the client
            .filter(str => str.trim() !== "" || !str.trim())
        singleTestCaseArr.shift() // Removes the test case name as we dont need it
        socket.to("test-case-failure-result", {
          message: singleTestCaseArr,
          testCaseName: name
        })
      }

    })
  }
}

export function processTestOutput (p: Deno.Process, filename: string) {
  processStdout(p, filename)
}
