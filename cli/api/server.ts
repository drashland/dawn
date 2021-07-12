import {Drash} from "../deps.ts";
import {TestsResource} from "./resources/tests_resource.ts";
import {RunResource} from "./resources/run_resource.ts";

export const server = new Drash.Http.Server({
  resources: [
    TestsResource,
    RunResource,
  ]
})