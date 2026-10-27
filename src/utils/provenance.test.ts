import { describe, expect, it } from "vitest";
import { provenanceSourceForStatus, provenanceSourceForTapInput } from "./provenance";

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

describe("provenanceSourceForTapInput — Session 3A Tap-to-Dimension", () => {
  it("maps confirmed to user_confirmed (same as the generic form)", () => {
    expect(provenanceSourceForTapInput("confirmed")).toBe("user_confirmed");
  });

  it("maps every unconfirmed status to tap_to_dimension, never user_read (stays distinguishable from manual-form entry and OCR transfer)", () => {
    expect(provenanceSourceForTapInput("read")).toBe("tap_to_dimension");
    expect(provenanceSourceForTapInput("missing")).toBe("tap_to_dimension");
    expect(provenanceSourceForTapInput("ambiguous")).toBe("tap_to_dimension");
    expect(provenanceSourceForTapInput("conflict")).toBe("tap_to_dimension");
  });
});
