import { afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

// A hook test file starts with `// @vitest-environment jsdom` and imports from here.
afterEach(cleanup);

export { act, renderHook };
