import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DatePicker,
  FileUpload,
  FormField,
  PhoneInput,
  SearchableSelect,
  TextInput,
} from "../index";

// The calendar is lazy; loading it up front keeps a cold transform out of the test budget.
beforeAll(async () => {
  await import("../DatePickerCalendar");
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}, 60_000);

afterEach(cleanup);

describe("FormField", () => {
  it("wires the label, hint, error and required state to the control", () => {
    render(
      <FormField label="Society name" required hint="As registered" error="Enter a name">
        <TextInput />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: /Society name/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAccessibleDescription("As registered Enter a name");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name");
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
  });

  it("leaves a valid field unmarked and keeps a child's own id and description", () => {
    render(
      <>
        <span id="extra">Extra</span>
        <FormField label="Name">
          <TextInput id="mine" aria-describedby="extra" />
        </FormField>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAttribute("id", "mine");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Extra");
  });

  it("hands field props to a render function", () => {
    render(
      <FormField label="Code" error="Bad">
        {(props) => <input data-testid="custom" {...props} />}
      </FormField>,
    );
    expect(screen.getByTestId("custom")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Code")).toBe(screen.getByTestId("custom"));
  });

  it("renders a fieldset and legend for a group", () => {
    render(
      <FormField label="Resident type" group>
        <div />
      </FormField>,
    );
    expect(screen.getByRole("group", { name: "Resident type" })).toBeInTheDocument();
  });
});

describe("PhoneInput", () => {
  function Harness({ onChange, ...props }) {
    const [value, setValue] = useState("");
    return (
      <PhoneInput
        {...props}
        aria-label="Mobile"
        value={value}
        onChange={(digits, meta) => {
          setValue(digits);
          onChange?.(digits, meta);
        }}
      />
    );
  }

  it("shows +91, and reports digits with the E.164 form once valid", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByText("+91")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "98765" } });
    expect(onChange).toHaveBeenLastCalledWith("98765", { e164: null, valid: false });
    fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "9876543210" } });
    expect(onChange).toHaveBeenLastCalledWith("9876543210", {
      e164: "+919876543210",
      valid: true,
    });
  });

  it("cleans up a pasted number", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Mobile");
    fireEvent.change(input, { target: { value: "+91 98765-43210" } });
    expect(input).toHaveValue("9876543210");
  });

  it("flags an incomplete number only after blur", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Mobile");
    fireEvent.change(input, { target: { value: "98765" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent(/10-digit/);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a number that cannot be an Indian mobile", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Mobile");
    fireEvent.change(input, { target: { value: "1234567890" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("defers to a parent's error instead of showing two", () => {
    render(
      <FormField label="Mobile" error="Enter your number">
        <PhoneInput value="98" onChange={() => {}} />
      </FormField>,
    );
    fireEvent.blur(screen.getByLabelText("Mobile"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your number");
  });
});

describe("DatePicker", () => {
  it("shows the placeholder, then the formatted value", () => {
    const { rerender } = render(<DatePicker aria-label="DOB" value="" onChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Select a date");
    rerender(<DatePicker value="2026-11-06" onChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("6 Nov 2026");
  });

  it("ignores an impossible date rather than rolling it over", () => {
    render(<DatePicker value="2026-02-31" onChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Select a date");
  });

  it("exposes the chosen date as the description when a label names the button", () => {
    render(
      <FormField label="Date of birth">
        <DatePicker value="2026-11-06" onChange={() => {}} />
      </FormField>,
    );
    const trigger = screen.getByRole("button", { name: "Date of birth" });
    expect(trigger).toHaveAccessibleDescription("6 Nov 2026");
  });

  it("opens a calendar and returns the picked day as yyyy-MM-dd", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-11-06" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const grid = await screen.findByRole("grid", {}, { timeout: 4000 });
    expect(grid).toBeInTheDocument();
    const day = screen
      .getAllByRole("button")
      .find((button) => /12 November 2026/.test(button.getAttribute("aria-label") ?? ""));
    fireEvent.click(day);
    expect(onChange).toHaveBeenCalledWith("2026-11-12");
  });

  it("announces the selected day and translated navigation", async () => {
    render(<DatePicker value="2026-11-06" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("grid", {}, { timeout: 4000 });
    expect(screen.getByRole("button", { name: /6 November 2026, selected/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
  });

  it("offers Clear only when clearable and set", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DatePicker value="2026-11-06" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
    rerender(<DatePicker clearable value="2026-11-06" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("SearchableSelect", () => {
  const OPTIONS = [
    { value: "a", label: "Alpha Wing" },
    { value: "b", label: "Beta Wing", disabled: true },
    { value: "c", label: "Gamma Wing", keywords: "tower three" },
  ];

  function setup(props = {}) {
    const onChange = vi.fn();
    render(<SearchableSelect aria-label="x" options={OPTIONS} onChange={onChange} {...props} />);
    return { onChange, input: screen.getByRole("combobox") };
  }

  it("opens with the keyboard and skips disabled options", () => {
    const { onChange, input } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[2].id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("c", OPTIONS[2]);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("filters by label and keywords", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "tower" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Gamma Wing");
  });

  it("never accepts free text: Enter and blur leave the value alone", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "Delta" } });
    expect(screen.getAllByText(/No matches/).length).toBeGreaterThan(0);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("restores the selected label on Escape", () => {
    const { input } = setup({ value: "a" });
    expect(input).toHaveValue("Alpha Wing");
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("Alpha Wing");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("selects by click, ignores disabled options", () => {
    const { onChange, input } = setup();
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("option", { name: "Beta Wing" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: "Alpha Wing" }));
    expect(onChange).toHaveBeenCalledWith("a", OPTIONS[0]);
  });

  it("does not submit a surrounding form from an open list", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SearchableSelect options={OPTIONS} />
      </form>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    const notPrevented = fireEvent.keyDown(input, { key: "Enter" });
    expect(notPrevented).toBe(false);
  });

  it("clears when clearable", () => {
    const { onChange } = setup({ value: "a", clearable: true });
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onChange).toHaveBeenCalledWith("", null);
  });
});

describe("FileUpload", () => {
  const pdf = (bytes = 10) =>
    new File(["x".repeat(bytes)], "proof.pdf", { type: "application/pdf" });
  const input = (container) => container.querySelector('input[type="file"]');
  const choose = (container, file) =>
    fireEvent.change(input(container), { target: { files: [file] } });

  it("rejects the wrong type without uploading", () => {
    const upload = vi.fn();
    const { container } = render(<FileUpload accept={[".pdf"]} upload={upload} />);
    choose(container, new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use PDF");
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects an oversized file and an empty one", () => {
    const { container } = render(<FileUpload maxBytes={5} upload={vi.fn()} />);
    choose(container, pdf(10));
    expect(screen.getByRole("alert")).toHaveTextContent("The limit is 5 B");
    choose(container, new File([], "empty.pdf"));
    expect(screen.getByRole("alert")).toHaveTextContent("empty");
  });

  it("shows real progress and reports Uploaded only after the promise resolves", async () => {
    let finish;
    let report;
    const onUploaded = vi.fn();
    const upload = vi.fn((_file, { onProgress }) => {
      report = onProgress;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { container } = render(<FileUpload upload={upload} onUploaded={onUploaded} />);
    choose(container, pdf());
    const bar = screen.getByRole("progressbar");
    // No report yet, so no number: indeterminate rather than an invented percentage.
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(screen.queryByText(/Uploaded/)).toBeNull();
    act(() => report(40));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    await act(async () => finish({ path: "x" }));
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith({ path: "x" }, expect.any(File));
  });

  it("shows a friendly error and retries a failed upload", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("relation storage.objects does not exist"))
      .mockResolvedValueOnce({});
    const { container } = render(<FileUpload upload={upload} />);
    choose(container, pdf());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Upload failed");
    expect(alert).not.toHaveTextContent("relation");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText(/Uploaded/)).toBeInTheDocument());
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("cancels an upload and ignores its late result", async () => {
    let finish;
    const onUploaded = vi.fn();
    const upload = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = render(<FileUpload upload={upload} onUploaded={onUploaded} />);
    choose(container, pdf());
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await act(async () => finish({}));
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a file")).toBeInTheDocument();
  });

  it("hands over the file without claiming an upload when there is no upload fn", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(<FileUpload onSelect={onSelect} onRemove={onRemove} />);
    choose(container, pdf());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("proof.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/Uploaded/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("is reachable from a FormField label", () => {
    const { container } = render(
      <FormField label="Proof" error="Required">
        <FileUpload upload={vi.fn()} />
      </FormField>,
    );
    expect(screen.getByLabelText("Proof")).toBe(input(container));
    expect(input(container)).toHaveAttribute("aria-invalid", "true");
  });
});
