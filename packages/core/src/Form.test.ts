import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form, getInternal } from "./Form";
import { FormDelegate } from "./delegation";
import {
  SampleConfigurableFieldBinding,
  SampleConfigurableFormBinding,
  SampleConfigurableMultiFieldBinding,
  SampleFieldBinding,
  SampleFormBinding,
  SampleMultiFieldBinding,
} from "./binding.test";
import { defaultConfig } from "./config";
import { FormField } from "./FormField";

describe("Form", () => {
  class EmptyModel {}

  class SampleModel implements FormDelegate<SampleModel> {
    @observable field = true;
    @observable otherField = true;

    constructor() {
      makeObservable(this);
    }

    async [FormDelegate.validate]() {
      return {
        field: this.field ? null : "invalid",
      };
    }

    async [FormDelegate.submit](signal: AbortSignal) {
      return new Promise<boolean>((resolve) => {
        const timerId = setTimeout(() => resolve(true), 100);
        signal.addEventListener("abort", () => {
          clearTimeout(timerId);
          resolve(false);
        });
      });
    }
  }

  class NestedModel implements FormDelegate<NestedModel> {
    @observable field = true;
    @observable sample = new SampleModel();
    @observable array = [new SampleModel()];

    constructor() {
      makeObservable(this);
    }

    [FormDelegate.connect]() {
      return [this.sample, this.array];
    }
  }

  describe(".get", () => {
    it("returns the same instance for the same subject", () => {
      const model = new SampleModel();
      const form1 = Form.get(model);
      const form2 = Form.get(model);
      expect(form1).toBe(form2);
      expect(form1.id).toBe(form2.id);
    });

    it("returns different instances for different subjects", () => {
      const model1 = new SampleModel();
      const model2 = new SampleModel();
      const form1 = Form.get(model1);
      const form2 = Form.get(model2);
      expect(form1).not.toBe(form2);
      expect(form1.id).not.toBe(form2.id);
    });

    it("returns different instances for different keys", () => {
      const model = new SampleModel();
      const form1 = Form.get(model);
      const form2 = Form.get(model, Symbol("key"));
      expect(form1).not.toBe(form2);
      expect(form1.id).not.toBe(form2.id);
    });

    it("returns the same instance for the same subject with the same key", () => {
      const model = new SampleModel();
      const key = Symbol("key");
      const form1 = Form.get(model, key);
      const form2 = Form.get(model, key);
      expect(form1).toBe(form2);
      expect(form1.id).toBe(form2.id);
    });

    it("retrieves instances of sub-forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      const sampleForm = Form.get(model.sample);
      const arrayForm = Form.get(model.array[0]);

      expect(form.subForms.size).toBe(2);
      expect(form.subForms).toContain(sampleForm);
      expect(form.subForms).toContain(arrayForm);
    });

    it("retrieves instances of sub-forms with a specified key", () => {
      const model = new NestedModel();
      const key = Symbol("custom-key");
      const form = Form.get(model, key);

      const sampleForm = Form.get(model.sample, key);
      const arrayForm = Form.get(model.array[0], key);

      expect(form.subForms.size).toBe(2);
      expect(form.subForms).toContain(sampleForm);
      expect(form.subForms).toContain(arrayForm);
    });
  });

  describe(".dispose", () => {
    it("disposes the form instance for a subject", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      Form.dispose(model);
      expect(Form.get(model)).not.toBe(form); // New instance is created
    });

    it("disposes the form instance for a subject with a specific key", () => {
      const model = new SampleModel();
      const key = Symbol("custom-key");
      const form = Form.get(model);
      const formWithKey = Form.get(model, key);
      Form.dispose(model, key);
      expect(Form.get(model, key)).not.toBe(formWithKey); // New instance is created
      expect(Form.get(model)).toBe(form); // Instances with different keys are not disposed
    });
  });

  describe("#subForms", () => {
    it("does not collect sub-forms from objects that do not implement FormDelegate.connect", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.subForms.size).toBe(0);
    });

    it("collects sub-forms via the delegate", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      expect(form.subForms).toEqual(new Set([Form.get(model.sample), Form.get(model.array[0])]));
    });

    it("updates sub-forms reactively", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      let observed: typeof form.subForms | null = null;
      autorun(() => {
        observed = form.subForms;
      });
      expect(observed).toBeDefined();
      expect(observed!.size).toBe(2);
      expect(observed).toEqual(form.subForms);

      runInAction(() => {
        model.array.push(new SampleModel());
      });
      expect(observed).toBeDefined();
      expect(observed!.size).toBe(3);
      expect(observed).toEqual(form.subForms);
    });
  });

  describe("#canSubmit", () => {
    it("returns true when the form is dirty and valid", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.canSubmit).toBe(false);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      form.reset();
      expect(form.canSubmit).toBe(false);
    });

    it("returns false when the validation is scheduled", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      form.validate();
      expect(form.canSubmit).toBe(false);
    });
  });

  describe("#markAsDirty", () => {
    it("marks the form as dirty", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.isDirty).toBe(false);
      form.markAsDirty();
      expect(form.isDirty).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the form", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.isDirty).toBe(true);
      form.reset();
      expect(form.isDirty).toBe(false);
    });

    it("resets sub-forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      const spy1 = vi.spyOn(Form.get(model.sample), "reset");
      const spy2 = vi.spyOn(Form.get(model.array[0]), "reset");

      form.reset();
      expect(spy1).toBeCalled();
      expect(spy2).toBeCalled();
    });
  });

  describe("#reportError", () => {
    it("triggers reportError on all fields", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const internal = getInternal(form);

      const field = internal.getField("field");

      const spy = vi.spyOn(field, "reportError");
      form.reportError();
      expect(spy).toBeCalled();
    });

    it("recursively triggers reportError on sub-forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      const arrayForm0 = Form.get(model.array[0]);

      const spy1 = vi.spyOn(sampleForm, "reportError");
      const spy2 = vi.spyOn(arrayForm0, "reportError");
      form.reportError();
      expect(spy1).toBeCalled();
      expect(spy2).toBeCalled();
    });
  });

  describe("#submit", () => {
    it("does nothing when FormDelegate.submit is not implemented", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);
      expect(await form.submit()).toBe(false);
    });

    it("returns true when submission occurred", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);
      expect(await form.submit()).toBe(true);
    });

    it("sets isSubmitting flag while submitting", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isSubmitting: ${form.isSubmitting}`);
      });

      const submit = form.submit();
      submit.then(() => timeline.push(`submit`));

      expect(await submit).toBe(true);
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isSubmitting: false",
          "isSubmitting: true",
          "isSubmitting: false",
          "submit",
        ]
      `);
    });

    it("discards subsequent submit requests while submitting", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isSubmitting: ${form.isSubmitting}`);
      });

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      // Start first submission
      const firstSubmit = form.submit();
      firstSubmit.then(() => timeline.push(`firstSubmit`));
      // Try to submit again while first is still running
      const secondSubmit = form.submit();
      secondSubmit.then(() => timeline.push(`secondSubmit`));

      expect(await firstSubmit).toBe(true); // First submit should be occurred
      expect(await secondSubmit).toBe(false); // Second submit should be discarded
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isSubmitting: false",
          "isSubmitting: true",
          "secondSubmit",
          "isSubmitting: false",
          "firstSubmit",
        ]
      `);
    });

    it("aborts ongoing submission when submitting with force option", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isSubmitting: ${form.isSubmitting}`);
      });

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      // Start first submission
      const firstSubmit = form.submit();
      firstSubmit.then(() => timeline.push(`firstSubmit`));
      // Force second submission while first is still running
      const secondSubmit = form.submit({ force: true });
      secondSubmit.then(() => timeline.push(`secondSubmit`));

      expect(await firstSubmit).toBe(false); // First submit should be aborted
      expect(await secondSubmit).toBe(true); // Second submit should be occurred
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isSubmitting: false",
          "isSubmitting: true",
          "isSubmitting: false",
          "firstSubmit",
          "secondSubmit",
        ]
      `);
    });
  });

  describe("#validate", () => {
    it("returns null and does nothing when FormDelegate.validate is not implemented", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      expect(form.validate()).toBe(null);
    });

    it("calls Validation#request and returns the status", async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const internal = getInternal(form);
      const spy = vi.spyOn(internal.validation, "request");
      expect(form.validate()).toBe("requested");
      expect(spy).toBeCalled();
    });
  });

  describe("#bind", () => {
    describe("Create a binding for the form", () => {
      describe("Without a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(SampleFormBinding);
          expect(binding.formId).toBe(form.id);
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(SampleFormBinding);
          const binding2 = form.bind(SampleFormBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });

      describe("With a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(SampleConfigurableFormBinding, { sample: true });
          expect(binding.formId).toBe(form.id);
          expect(binding.config).toEqual({ sample: true });
        });

        it("returns the same binding instance when called multiple times but updates the config", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(SampleConfigurableFormBinding, { sample: true });
          expect(binding1.config).toEqual({ sample: true });
          const binding2 = form.bind(SampleConfigurableFormBinding, { sample: false });
          expect(binding1.bindingId).toBe(binding2.bindingId);
          expect(binding2.config).toEqual({ sample: false });
        });
      });
    });

    describe("Create a binding for a field", () => {
      describe("Without a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind("field", SampleFieldBinding);
          expect(binding.fieldName).toBe("field");
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind("field", SampleFieldBinding);
          const binding2 = form.bind("field", SampleFieldBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });

      describe("With a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind("field", SampleConfigurableFieldBinding, { sample: true });
          expect(binding.fieldName).toBe("field");
          expect(binding.config).toEqual({ sample: true });
        });

        it("returns the same binding instance when called multiple times but updates the config", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind("field", SampleConfigurableFieldBinding, { sample: true });
          expect(binding1.config).toEqual({ sample: true });
          const binding2 = form.bind("field", SampleConfigurableFieldBinding, { sample: false });
          expect(binding1.bindingId).toBe(binding2.bindingId);
          expect(binding2.config).toEqual({ sample: false });
        });
      });
    });

    describe("Create a binding for multiple fields", () => {
      describe("Without a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(["field", "otherField"], SampleMultiFieldBinding);
          expect(binding.fieldNames).toEqual(["field", "otherField"]);
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(["field", "otherField"], SampleMultiFieldBinding);
          const binding2 = form.bind(["field", "otherField"], SampleMultiFieldBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });

      describe("With a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(["field", "otherField"], SampleConfigurableMultiFieldBinding, {
            sample: true,
          });
          expect(binding.fieldNames).toEqual(["field", "otherField"]);
          expect(binding.config).toEqual({ sample: true });
        });

        it("returns the same binding instance when called multiple times but updates the config", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(["field", "otherField"], SampleConfigurableMultiFieldBinding, {
            sample: true,
          });
          expect(binding1.config).toEqual({ sample: true });
          const binding2 = form.bind(["field", "otherField"], SampleConfigurableMultiFieldBinding, {
            sample: false,
          });
          expect(binding1.bindingId).toBe(binding2.bindingId);
          expect(binding2.config).toEqual({ sample: false });
        });
      });
    });
  });
});

suite("Sub-forms", () => {
  class SampleModel implements FormDelegate<SampleModel> {
    @observable field = true;

    constructor() {
      makeObservable(this);
    }

    async [FormDelegate.validate]() {
      return {
        field: this.field ? null : "invalid",
      };
    }
  }

  class NestedModel implements FormDelegate<NestedModel> {
    @observable field = true;
    @observable sample = new SampleModel();
    @observable array = [new SampleModel()];

    constructor() {
      makeObservable(this);
    }

    async [FormDelegate.validate]() {
      return {
        field: this.field ? null : "invalid",
      };
    }

    [FormDelegate.connect]() {
      return [this.sample, this.array];
    }
  }

  const setupEnv = () => {
    const model = new NestedModel();
    const form = Form.get(model);
    const sampleForm = Form.get(model.sample);
    const arrayForm0 = Form.get(model.array[0]);

    return {
      model,
      form,
      sampleForm,
      arrayForm0,
      getField<T>(form: Form<T>, fieldName: FormField.Name<T>) {
        return getInternal(form).getField(fieldName);
      },
      async waitForValidation() {
        await new Promise((resolve) => setTimeout(resolve, defaultConfig.validationDelayMs + 10));
      },
    };
  };

  suite("Dirty check", () => {
    test("when a sub-form becomes dirty, the parent form also becomes dirty", () => {
      const { form, sampleForm } = setupEnv();

      expect(sampleForm.isDirty).toBe(false);
      expect(form.isDirty).toBe(false);

      sampleForm.markAsDirty();

      expect(sampleForm.isDirty).toBe(true);
      expect(form.isDirty).toBe(true);
    });

    test("when a parent form becomes dirty, sub-forms remain unaffected", () => {
      const { form, sampleForm } = setupEnv();

      expect(sampleForm.isDirty).toBe(false);
      expect(form.isDirty).toBe(false);

      form.markAsDirty();

      expect(form.isDirty).toBe(true);
      expect(sampleForm.isDirty).toBe(false);
    });
  });

  suite("Validation", () => {
    test("when a sub-form becomes invalid, the parent form also becomes invalid", async () => {
      const { model, form, sampleForm, waitForValidation } = setupEnv();

      expect(sampleForm.isValid).toBe(true);
      expect(form.isValid).toBe(true);

      runInAction(() => {
        model.sample.field = false;
      });
      sampleForm.validate();
      await waitForValidation();

      expect(sampleForm.isValid).toBe(false);
      expect(form.isValid).toBe(false);
    });

    test("when a parent form becomes invalid, sub-forms remain unaffected", async () => {
      const { model, form, sampleForm, waitForValidation } = setupEnv();

      expect(sampleForm.isValid).toBe(true);
      expect(form.isValid).toBe(true);

      runInAction(() => {
        model.field = false;
      });
      form.validate();
      await waitForValidation();

      expect(form.isValid).toBe(false);
      expect(sampleForm.isValid).toBe(true);
    });
  });

  suite("Reporting errors", () => {
    test("when a new field is added after reportError is called, the error on the new field is not reported", async () => {
      const { form, getField } = setupEnv();

      const field1 = getField(form, "field");
      expect(field1.isErrorReported).toEqual(false);
      form.reportError();
      expect(field1.isErrorReported).toEqual(true);

      const field2 = getField(form, "sample");
      expect(field2.isErrorReported).toEqual(false);
    });

    test("reporting errors on sub-forms does not affect the parent form", async () => {
      const { form, sampleForm, arrayForm0, getField } = setupEnv();

      // Touch fields to initialize them
      const field1 = getField(form, "field");
      const field2 = getField(sampleForm, "field");
      const field3 = getField(arrayForm0, "field");

      // Report errors on sub-forms
      sampleForm.reportError();
      arrayForm0.reportError();

      expect(field1.isErrorReported).toEqual(false);
      expect(field2.isErrorReported).toEqual(true);
      expect(field3.isErrorReported).toEqual(true);
    });

    test("when a new sub-form is added after reportError is called, the error on the new form is not reported", async () => {
      const { model, form, arrayForm0, getField } = setupEnv();

      // Touch fields to initialize them
      const field1 = getField(form, "field");
      const field2 = getField(arrayForm0, "field");

      // Report errors on the parent form
      form.reportError();

      // Add a new sub-form
      runInAction(() => {
        model.array.push(new SampleModel());
      });
      const arrayForm1 = Form.get(model.array[1]);
      const field3 = getField(arrayForm1, "field");

      expect(field1.isErrorReported).toEqual(true);
      expect(field2.isErrorReported).toEqual(true);
      expect(field3.isErrorReported).toEqual(false);
    });
  });
});
