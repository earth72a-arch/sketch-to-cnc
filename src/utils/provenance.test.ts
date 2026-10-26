import { describe, expect, it } from "vitest";
import { provenanceSourceForStatus } from "./provenance";

describe("provenanceSourceForStatus", () => {
  it("maps confirmed to user_confirmed", () => {
    expect(provenanceSourceForStatus("confirmed")).toBe("user_confirmed");
  });

  it("maps derived and rule to their own sources", () => {
    expect(provenanceSourceForStatus("derived")).toBe("derived");
    expect(provenanceSourceForStatus("rule")).toBe("rule");
  });

  it("maps read/missing/ambiguous/conflict to user_read (never auto-approved)", () => {
    expect(provenanceSourceForStatus("read")).toBe("user_read");
    expect(provenanceSourceForStatus("missing")).toBe("user_read");
    expect(provenanceSourceForStatus("ambiguous")).toBe("user_read");
    expect(provenanceSourceForStatus("conflict")).toBe("user_read");
  });
});
