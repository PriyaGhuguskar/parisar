import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConfirmDialog,
  CopyButton,
  DataTable,
  EmptyState,
  ErrorState,
  FormActions,
  LoadingState,
  MetricCard,
  Notice,
  STATUS_VALUES,
  StatusBadge,
  Stepper,
} from "../index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const shard = (lng) =>
  JSON.parse(
    readFileSync(
      path.resolve(__dirname, `../../../../../packages/i18n/locales/${lng}/kit.json`),
      "utf8",
    ),
  );

describe("Stepper", () => {
  const steps = [
    { id: "a", label: "Society" },
    { id: "b", label: "Wings" },
    { id: "c", label: "Flats" },
  ];

  it("marks the current step and offers a compact phone summary", () => {
    render(<Stepper steps={steps} current={1} />);
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    const list = within(screen.getByRole("list"));
    expect(list.getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Completed")).toHaveClass("sr-only");
  });

  it("lets only finished steps be revisited", () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={steps} current={1} onStepClick={onStepClick} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onStepClick).toHaveBeenCalledWith(0, steps[0]);
  });

  it("has no buttons without a handler, so nothing is dead", () => {
    render(<Stepper steps={steps} current={2} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("honours an explicit error status", () => {
    render(<Stepper steps={[{ ...steps[0], status: "error" }, steps[1]]} current={1} />);
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("renders only the full list when vertical", () => {
    render(<Stepper steps={steps} current={0} orientation="vertical" />);
    expect(screen.queryByText("Step 1 of 3")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("DataTable", () => {
  const columns = [
    { key: "name", header: "Society", primary: true },
    { key: "city", header: "City" },
    { key: "secret", header: "Internal", searchable: false, hideOnCard: true },
  ];
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: String(i + 1),
    name: `Society ${i + 1}`,
    city: i % 2 ? "Pune" : "Mumbai",
    secret: "hidden-term",
  }));
  const table = () => within(screen.getByRole("table"));

  it("renders a table with a caption and scoped headers, plus stacked cards", () => {
    render(<DataTable caption="Societies" columns={columns} rows={rows} pageSize={5} />);
    expect(screen.getByRole("table", { name: "Societies" })).toBeInTheDocument();
    expect(table().getByRole("columnheader", { name: "City" })).toHaveAttribute("scope", "col");
    expect(table().getAllByRole("row")).toHaveLength(6);
    expect(screen.getAllByText("Society 1")).toHaveLength(2);
  });

  it("omits hideOnCard columns from the stacked cards only", () => {
    render(<DataTable caption="S" columns={columns} rows={rows.slice(0, 1)} />);
    const cards = screen.getAllByRole("list").find((list) => list.tagName === "UL");
    expect(within(cards).queryByText("Internal")).toBeNull();
    expect(table().getByText("Internal")).toBeInTheDocument();
  });

  it("pages through rows and disables the ends", () => {
    render(<DataTable caption="S" columns={columns} rows={rows} pageSize={10} />);
    expect(screen.getByText("1–10 of 25")).toBeInTheDocument();
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("11–20 of 25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("21–25 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("searches, honours searchable:false and returns to page 1", () => {
    render(<DataTable caption="S" columns={columns} rows={rows} pageSize={10} searchable />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "society 25" } });
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "hidden-term" } });
    expect(screen.getByText("No matching results")).toBeInTheDocument();
  });

  it("filters, and clears from the no-results state", () => {
    const filters = [
      {
        key: "city",
        label: "City",
        options: [
          { value: "Pune", label: "Pune" },
          { value: "Nagpur", label: "Nagpur" },
        ],
      },
    ];
    render(<DataTable caption="S" columns={columns} rows={rows} pageSize={50} filters={filters} />);
    const select = screen.getByRole("combobox", { name: "City" });
    fireEvent.change(select, { target: { value: "Pune" } });
    expect(screen.getByText("1–12 of 12")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "Nagpur" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("1–25 of 25")).toBeInTheDocument();
  });

  it("shows a skeleton only when there is nothing to show yet", () => {
    const { rerender } = render(<DataTable caption="S" columns={columns} loading />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    rerender(<DataTable caption="S" columns={columns} rows={rows.slice(0, 2)} loading />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("shows the error state with a working retry", () => {
    const onRetry = vi.fn();
    render(<DataTable caption="S" columns={columns} rows={rows} error onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This couldn't load");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the caller's empty state when there are no records", () => {
    render(
      <DataTable
        caption="S"
        columns={columns}
        rows={[]}
        emptyState={{ title: "No requests yet", description: "They appear here." }}
      />,
    );
    expect(screen.getByText("No requests yet")).toBeInTheDocument();
    expect(screen.queryByText("Clear filters")).toBeNull();
  });

  it("links the primary cell and renders row actions in both layouts", () => {
    render(
      <DataTable
        caption="S"
        columns={columns}
        rows={rows.slice(0, 1)}
        rowHref={(row) => `/x/${row.id}`}
        rowActions={() => <button type="button">Open</button>}
      />,
    );
    expect(screen.getAllByRole("link", { name: "Society 1" })[0]).toHaveAttribute("href", "/x/1");
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(2);
  });

  it("server mode: shows rows as given, reports queries, debounces search", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    render(
      <DataTable
        caption="S"
        columns={columns}
        rows={rows.slice(0, 10)}
        pageSize={10}
        serverSide
        total={25}
        searchable
        onQueryChange={onQueryChange}
      />,
    );
    expect(onQueryChange).not.toHaveBeenCalled();
    expect(screen.getByText("1–10 of 25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    act(() => vi.advanceTimersByTime(0));
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

    onQueryChange.mockClear();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ab" } });
    act(() => vi.advanceTimersByTime(100));
    expect(onQueryChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "ab", page: 1 }),
    );
  });
});

describe("MetricCard", () => {
  it("shows the label and value, and an em dash when there is no value", () => {
    const { rerender } = render(<MetricCard label="Open" value={12} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    rerender(<MetricCard label="Open" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a placeholder, never a number, while loading", () => {
    render(<MetricCard label="Open" value={99} loading />);
    expect(screen.queryByText("99")).toBeNull();
  });

  it("becomes a link only with href", () => {
    render(<MetricCard label="Open" value={1} href="/admin" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin");
  });
});

describe("StatusBadge", () => {
  it.each(STATUS_VALUES)("%s has a real English label", (status) => {
    cleanup();
    render(<StatusBadge status={status} />);
    expect(screen.queryByText(`status.${status}`)).toBeNull();
  });

  it.each(["en", "hi", "mr"])("every status is translated in %s", (lng) => {
    const labels = shard(lng).status;
    const missing = STATUS_VALUES.filter((status) => !labels[status]);
    expect(missing).toEqual([]);
    expect(Object.keys(labels).sort()).toEqual([...STATUS_VALUES].sort());
  });

  it("covers the connect statuses the database emits", () => {
    for (const status of ["new", "contacted", "call_scheduled", "rescheduled", "registered"]) {
      expect(STATUS_VALUES).toContain(status);
    }
  });

  it("renders an unknown value readably and resists prototype keys", () => {
    render(<StatusBadge status="on_hold" />);
    expect(screen.getByText("On hold")).toBeInTheDocument();
    cleanup();
    render(<StatusBadge status="constructor" />);
    expect(screen.getByText("Constructor")).toBeInTheDocument();
  });

  it("accepts a label override", () => {
    render(<StatusBadge status="new" label="Fresh" />);
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  const base = { open: true, title: "Remove resident?", confirmLabel: "Remove" };

  it("renders as an alert dialog and starts focus on Cancel when destructive", async () => {
    render(<ConfirmDialog {...base} onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("closes after a successful async confirm", async () => {
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...base} onOpenChange={onOpenChange} onConfirm={async () => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays open with a message when the action fails, hiding the raw error", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error("permission denied for table x"));
    render(<ConfirmDialog {...base} onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("didn't complete");
    expect(alert).not.toHaveTextContent("permission denied");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("locks both buttons while working, so it cannot be confirmed twice", async () => {
    let finish;
    const onConfirm = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<ConfirmDialog {...base} onOpenChange={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => finish());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("opens from a trigger when uncontrolled", async () => {
    render(
      <ConfirmDialog
        title="Sure?"
        trigger={<button type="button">Delete</button>}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("LoadingState announces each variant", () => {
    for (const variant of ["page", "inline", "cards"]) {
      const { unmount } = render(<LoadingState variant={variant} label="Fetching" />);
      expect(screen.getByRole("status")).toHaveTextContent("Fetching");
      unmount();
    }
    render(<LoadingState variant="list" label="Fetching" />);
    expect(screen.getByText("Fetching")).toBeInTheDocument();
  });

  it("ErrorState has no retry button without a handler", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveTextContent("Check your connection");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("EmptyState renders its title, description and action", () => {
    render(<EmptyState title="Nothing" description="Add one" action={<a href="/x">Add</a>} />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add" })).toBeInTheDocument();
  });

  it("Notice is polite for success and interrupts for danger", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Notice tone="success" title="Saved" onDismiss={onDismiss}>
        Done
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(<Notice tone="danger">Failed</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("CopyButton", () => {
  const stubClipboard = (writeText) =>
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  it("says Copied only after the clipboard accepts, then resets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onCopied = vi.fn();
    render(<CopyButton value="https://x/invite/abc" label="Copy link" onCopied={onCopied} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("https://x/invite/abc");
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it("reports failure rather than claiming success", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    document.execCommand = vi.fn(() => false);
    const onCopied = vi.fn();
    render(<CopyButton value="x" onCopied={onCopied} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: /Couldn't copy/ })).toBeInTheDocument();
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("falls back to the legacy path where the clipboard API is missing", async () => {
    stubClipboard(undefined);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => true);
    render(<CopyButton value="x" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("FormActions", () => {
  it("submits the surrounding form by default", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <FormActions submitLabel="Save and continue" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("renders Back and Cancel only when they do something", () => {
    const onBack = vi.fn();
    const { rerender } = render(<FormActions />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    rerender(<FormActions onBack={onBack} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("locks every action while submitting", () => {
    render(<FormActions submitting onBack={() => {}} onCancel={() => {}} />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute("aria-busy", "true");
  });

  it("uses a plain button when given onSubmit", () => {
    const onSubmit = vi.fn();
    render(<FormActions submitLabel="Go" onSubmit={onSubmit} />);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
