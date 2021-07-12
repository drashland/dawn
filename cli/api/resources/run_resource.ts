import {Drash} from "../../deps.ts";

export class RunResource extends Drash.Http.Resource {
  static paths = ["/run"]

  /**
   * url query parameters:
   *
   *   - `dir`. Required. The directory, eg if test file path is `tests/browser/pages/test_file.ts`, then `dir` is `pages`
   *   - `filename`. Optional. Just the filename to run
   */
  public GET () {
    const dir = this.request.getUrlQueryParam("dir") || ""
    const filename = this.request.getUrlQueryParam("filename") || ""
    const url = "http://localhost:64942/tests?dir=" + dir + (filename ? "&filename=" + filename : "")
    Deno.run({
      cmd: ["open", "-na", "Google Chrome", "--args", "--new-window", url]
    })
  }
}