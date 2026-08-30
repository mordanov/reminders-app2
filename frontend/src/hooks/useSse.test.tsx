import { act, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSse } from "./useSse";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(public url: string, public options: EventSourceInit) {
    FakeEventSource.instances.push(this);
  }
}

function Harness({ client, enabled }: { client: QueryClient; enabled: boolean }) {
  return <output>{useSse(client, enabled)}</output>;
}

describe("useSse", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
  });

  it("stays connected without opening a source when disabled or unsupported", () => {
    const client = new QueryClient();
    const first = render(<Harness client={client} enabled={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("connected");
    first.unmount();
    vi.stubGlobal("EventSource", undefined);
    render(<Harness client={client} enabled />);
    expect(screen.getByRole("status")).toHaveTextContent("connected");
  });

  it("uses /api/events, invalidates queries, reconnects, and cleans up", () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const view = render(<Harness client={client} enabled />);
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe("/api/events");
    expect(source.options).toEqual({ withCredentials: true });

    act(() => source.onmessage?.());
    expect(invalidate).toHaveBeenCalled();
    act(() => source.onerror?.());
    expect(screen.getByRole("status")).toHaveTextContent("reconnecting");
    expect(source.close).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2_500));
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => FakeEventSource.instances[1].onopen?.());
    expect(screen.getByRole("status")).toHaveTextContent("connected");
    view.unmount();
    expect(FakeEventSource.instances[1].close).toHaveBeenCalled();
  });
});
