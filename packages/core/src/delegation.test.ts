import { FormDelegate, getDelegation, isConnectableObject } from "./delegation";

describe("getDelegation", () => {
  it("gets direct delegation when subject implements FormDelegate", () => {
    const delegate = {
      [FormDelegate.config]: {},
      [FormDelegate.submit]: async () => true,
      [FormDelegate.validate]: async () => ({}),
    };

    expect(getDelegation(delegate)).toBe(delegate);
  });

  it("gets indirect delegation when subject implements FormDelegated", () => {
    const delegate = {
      [FormDelegate.config]: {},
      [FormDelegate.submit]: async () => true,
      [FormDelegate.validate]: async () => ({}),
    };

    const subject = {
      [FormDelegate.delegate]: delegate,
    };

    expect(getDelegation(subject)).toBe(delegate);
  });

  it("returns undefined for non-object values", () => {
    expect(getDelegation(null)).toBeUndefined();
    expect(getDelegation(undefined)).toBeUndefined();
    expect(getDelegation(123)).toBeUndefined();
    expect(getDelegation("string")).toBeUndefined();
  });

  it("returns undefined for objects without delegation", () => {
    expect(getDelegation({})).toBeUndefined();
    expect(getDelegation([])).toBeUndefined();
    expect(getDelegation({ foo: "bar" })).toBeUndefined();
  });
});

describe("isConnectableObject", () => {
  it("returns true for objects that implement FormDelegate.validate or FormDelegate.connect", () => {
    expect(isConnectableObject({ [FormDelegate.validate]: async () => ({}) })).toBe(true);
    expect(isConnectableObject({ [FormDelegate.connect]: async () => ({}) })).toBe(true);
  });

  it("returns false for objects that implement FormDelegate.submit", () => {
    expect(isConnectableObject({ [FormDelegate.submit]: async () => ({}) })).toBe(false);
  });

  it("returns true for objects that implement FormDelegated and delegate implements FormDelegate.validate or FormDelegate.connect", () => {
    expect(isConnectableObject({ [FormDelegate.delegate]: { [FormDelegate.validate]: async () => ({}) } })).toBe(true);
    expect(isConnectableObject({ [FormDelegate.delegate]: { [FormDelegate.connect]: async () => ({}) } })).toBe(true);
  });

  it("returns false for objects that implement FormDelegated and delegate implements FormDelegate.submit", () => {
    expect(isConnectableObject({ [FormDelegate.delegate]: { [FormDelegate.submit]: async () => ({}) } })).toBe(false);
  });

  it("returns false for objects that do not implement FormDelegate or FormDelegated", () => {
    expect(isConnectableObject({})).toBe(false);
  });
});
