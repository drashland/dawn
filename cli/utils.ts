import {walkSync} from "./deps.ts";

type TestFiles = {
  [key: string]: string[]
}

export function getProjectName (): string {
  const cwd = Deno.cwd();
  const parts = cwd.split("/")
  const dirName = parts[parts.length - 1]
  return dirName
}

// eg if we have tests/browser/pages/home_page_test.ts: { pages: ["home_page_test.ts"] }
export function constructTestFilesList (): TestFiles {
  const result: TestFiles = {}
  let subDirWeAreIn = "";
  for (const entry of walkSync("./tests/browser")) {
    // Ignore trying to add `tests/browser`
    if (entry.path === "tests/browser") {
      continue
    }

    // If we have reached a dir, create a new key
    if (entry.isDirectory === true) {
      result[entry.name] = []
      subDirWeAreIn = entry.name
      continue
    }

    // If we have reached a file, add it to the dir (key) it's under
    if (entry.isFile === true) {
      result[subDirWeAreIn].push(entry.name)
    }
  }
  return result
}