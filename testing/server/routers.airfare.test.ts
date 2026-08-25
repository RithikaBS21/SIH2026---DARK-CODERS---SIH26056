import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext() {
  return {
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as TrpcContext;
}

describe("airfare typed API", () => {
  it("exposes transparent methodology and a clear ethical data boundary", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const methodology = await caller.airfare.methodology();

    expect(methodology.baseline).toContain("first seven");
    expect(methodology.exclusions).toContain("outlier");
    expect(methodology.dataBoundary).toContain("does not collect");
  });
});
