import { describe, expect, it } from "vitest";
import {
  absolutePoints,
  addPoints,
  comparePoints,
  fromScaledPoints,
  multiplyPointsByRate,
  subtractPoints,
  toScaledPoints
} from "../../src/domain/index.js";

describe("point amount helpers", () => {
  it("converts decimal credit values without floating point drift", () => {
    expect(toScaledPoints("12.3456")).toBe(123456n);
    expect(fromScaledPoints(123456n)).toBe("12.3456");
    expect(addPoints("0.1000", "0.2000")).toBe("0.3000");
    expect(subtractPoints("10.0000", "3.2500")).toBe("6.7500");
  });

  it("compares normalized point values", () => {
    expect(comparePoints("1", "1.0000")).toBe(0);
    expect(comparePoints("1.0001", "1.0000")).toBe(1);
    expect(comparePoints("0.9999", "1.0000")).toBe(-1);
  });

  it("calculates commission amounts with fixed precision", () => {
    expect(absolutePoints("-20.0000")).toBe("20.0000");
    expect(multiplyPointsByRate("20.0000", "0.1000")).toBe("2.0000");
    expect(multiplyPointsByRate("33.3333", "0.1500")).toBe("5.0000");
  });
});
