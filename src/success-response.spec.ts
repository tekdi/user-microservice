import { SuccessResponse } from "./success-response";

describe("SuccessResponse", () => {
  let base: Partial<SuccessResponse>;

  beforeEach(() => {
    base = {
      statusCode: 200,
      message: "OK",
      totalCount: 10,
      data: { id: 1, name: "item" },
    };
  });

  it("should construct with full payload", () => {
    const res = new SuccessResponse(base);
    expect(res).toBeDefined();
    expect(res.statusCode).toBe(200);
    expect(res.message).toBe("OK");
    expect(res.totalCount).toBe(10);
    expect(res.data).toEqual({ id: 1, name: "item" });
  });

  it("should allow partial construction", () => {
    const res = new SuccessResponse({ message: "Created" });
    expect(res.message).toBe("Created");
    expect(res.statusCode).toBeUndefined();
    expect(res.totalCount).toBeUndefined();
    expect(res.data).toBeUndefined();
  });

  it("should accept different types for totalCount and data", () => {
    const res1 = new SuccessResponse({ totalCount: "25" as any, data: ["a"] as any });
    expect(res1.totalCount).toBe("25");
    expect(res1.data).toEqual(["a"]);

    const res2 = new SuccessResponse({ totalCount: 0, data: null as any });
    expect(res2.totalCount).toBe(0);
    expect(res2.data).toBeNull();
  });

  it("should not mutate the input partial object", () => {
    const input = { message: "Hello" } as Partial<SuccessResponse>;
    const before = { ...input };
    const res = new SuccessResponse(input);
    expect(input).toEqual(before);
    expect(res.message).toBe("Hello");
  });

  it("should handle edge values (negative statusCode, empty message)", () => {
    const res = new SuccessResponse({ statusCode: -1, message: "" });
    expect(res.statusCode).toBe(-1);
    expect(res.message).toBe("");
  });
});


