import React from "react";
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable } from "mobx";
import { Form, FormDelegate } from "@form-model/core";
import "./extension";
import { observer } from "mobx-react-lite";
import { SubmitButtonBinding } from "./SubmitButtonBinding";

class SampleModel implements FormDelegate<SampleModel> {
  constructor() {
    makeObservable(this);
  }

  async [FormDelegate.submit]() {
    return this.submitDeferred.promise;
  }

  private submitDeferred = (() => {
    let resolve = (): void => void 0;
    const promise = new Promise<boolean>((_resolve) => {
      resolve = () => _resolve(true);
    });
    return { promise, resolve };
  })();

  async completeSubmit() {
    this.submitDeferred.resolve();
    return this.submitDeferred.promise;
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);
  return (
    <>
      <button aria-label="submit" {...form.bindSubmitButton()}>
        Submit
      </button>
    </>
  );
});

describe("SubmitButtonBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const binding = new SubmitButtonBinding(form, {});
    const element = document.createElement("button");
    const fakeEvent = () => {
      return { currentTarget: element } as any;
    };

    return {
      model,
      form,
      binding,
      fakeEvent,
    };
  };

  describe("#onClick", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onClick(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onClick = callback;
      env.binding.onClick(env.fakeEvent());
      expect(callback).toHaveBeenCalledWith(env.fakeEvent());
    });
  });

  describe("#onMouseEnter", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onMouseEnter(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onMouseEnter = callback;
      env.binding.onMouseEnter(env.fakeEvent());
      expect(callback).toHaveBeenCalledWith(env.fakeEvent());
    });
  });
});

suite("bindSubmitButton", () => {
  const setupEnv = () => {
    const model = new SampleModel();

    render(<SampleComponent model={model} />);
    const button = screen.getByLabelText("submit") as HTMLButtonElement;

    return {
      model,
      form: Form.get(model),
      button: button,
      async clickButton() {
        await userEvent.click(button);
      },
      async hoverButton() {
        await userEvent.hover(button);
      },
    };
  };

  test("Activates and disables the button", async () => {
    const env = setupEnv();

    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    act(() => {
      env.form.markAsDirty();
    });
    expect(env.form.isSubmitting).toBe(false);
    expect(env.form.canSubmit).toBe(true);
    expect(env.button).not.toBeDisabled();

    await env.clickButton();

    expect(env.form.isSubmitting).toBe(true);
    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    await act(async () => {
      await env.model.completeSubmit();
    });

    expect(env.form.isSubmitting).toBe(false);
    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();
  });

  test("Hovering the button triggers form.reportError()", async () => {
    const env = setupEnv();
    const spy = vi.spyOn(env.form, "reportError");

    act(() => {
      env.form.markAsDirty();
    });
    await env.hoverButton();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
