import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import {
  IDLE_UPDATER_DOWNLOAD,
  type UpdaterDownloadState,
} from "../../shared/updaterDownload";
import { UpdateDownloadStatus } from "./UpdateDownloadStatus";

const state = (patch: Partial<UpdaterDownloadState>): UpdaterDownloadState => ({
  ...IDLE_UPDATER_DOWNLOAD,
  revision: 1,
  ...patch,
});

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
});

it("shows byte progress without inventing a percentage when total is unknown", () => {
  render(
    <UpdateDownloadStatus
      state={state({
        phase: "downloading",
        version: "0.5.3",
        downloaded: 2 * 1024 * 1024,
        total: null,
        percent: null,
        bytesPerSecond: 512 * 1024,
      })}
      checking={false}
    />,
  );
  expect(screen.getByText(/2.0 MB downloaded/)).toBeInTheDocument();
  expect(screen.getByText(/512 KB\/s/)).toBeInTheDocument();
  expect(document.querySelector('[style*="width"]')).toBeNull();
});

it("keeps the failure reason visible and exposes an explicit retry action", () => {
  const retry = vi.fn(async () => undefined);
  render(
    <UpdateDownloadStatus
      state={state({
        phase: "failed",
        downloaded: 1024,
        errorCode: "network",
        error: "socket closed",
        retryable: true,
      })}
      checking={false}
      onRetry={retry}
    />,
  );
  expect(
    screen.getByText("Update download failed: Network connection failed"),
  ).toBeInTheDocument();
  expect(screen.getByText("socket closed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry download" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("does not render an idle panel", () => {
  const { container } = render(
    <UpdateDownloadStatus state={IDLE_UPDATER_DOWNLOAD} checking={false} />,
  );
  expect(container.firstChild).toBeNull();
});


it('renders an accessible bounded percentage and preserves bytes while retrying', () => {
  render(<UpdateDownloadStatus state={state({ phase: 'retrying', downloaded: 52428800, total: 104857600, percent: 50, attempt: 2, maxAttempts: 3, retryAtMs: Date.now() + 2000 })} checking={false} />);
  expect(screen.getByRole('progressbar', { name: 'Update download progress' })).toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByText('50.0 MB / 100.0 MB')).toBeInTheDocument();
  expect(screen.getByText(/2\/3/)).toBeInTheDocument();
});

it('uses the existing restart controls for ready packages without an empty status panel', () => {
  const { container } = render(<UpdateDownloadStatus state={state({ phase: 'ready', version: '0.5.12' })} checking={false} />);
  expect(container.firstChild).toBeNull();
});
