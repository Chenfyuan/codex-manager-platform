import { describe, expect, it } from "vitest";
import { reorderAccountIds } from "@/components/dashboard/accountOrder";

describe("reorderAccountIds", () => {
  it("reorders the full list when all accounts are visible", () => {
    expect(
      reorderAccountIds({
        allAccountIds: ["a1", "a2", "a3"],
        visibleAccountIds: ["a1", "a2", "a3"],
        draggedId: "a3",
        targetId: "a1",
      }),
    ).toEqual(["a3", "a1", "a2"]);
  });

  it("reorders only visible accounts and preserves hidden positions", () => {
    expect(
      reorderAccountIds({
        allAccountIds: ["a1", "b1", "a2", "b2", "a3"],
        visibleAccountIds: ["a1", "a2", "a3"],
        draggedId: "a3",
        targetId: "a1",
      }),
    ).toEqual(["a3", "b1", "a1", "b2", "a2"]);
  });
});
