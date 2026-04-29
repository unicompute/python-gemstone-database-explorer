"""Operational soak runner for the shared GemStone session broker.

Run this against a real Stone when you want longer-lived concurrency pressure
than the unit suite provides:

    .venv/bin/python -m gemstone_p.session_soak --workers 8 --iterations 100

The broker still serializes GCI access with the global lock in `session.py`,
so this is not a throughput benchmark. It is meant to catch channel reuse,
login/logout churn, broken-session recovery, and request-session cleanup
problems under sustained threaded pressure.
"""

from __future__ import annotations

import argparse
import json
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from flask import Flask

from gemstone_p import session as gs_session


@dataclass(frozen=True)
class SoakConfig:
    workers: int
    iterations: int
    channels: int
    write_every: int
    read_statement: str
    write_statement: str
    pause_ms: int


def _channel_name(operation_index: int, channel_count: int) -> str:
    if channel_count <= 1:
        return "soak-0"
    return f"soak-{operation_index % channel_count}"


def _is_write_iteration(iteration: int, write_every: int) -> bool:
    return write_every > 0 and (iteration + 1) % write_every == 0


def _percentile(sorted_values: list[float], fraction: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


def _latency_summary(latencies_ms: list[float]) -> dict[str, float]:
    values = sorted(latencies_ms)
    if not values:
        return {
            "min": 0.0,
            "avg": 0.0,
            "p50": 0.0,
            "p95": 0.0,
            "max": 0.0,
        }
    return {
        "min": round(values[0], 3),
        "avg": round(sum(values) / len(values), 3),
        "p50": round(_percentile(values, 0.50), 3),
        "p95": round(_percentile(values, 0.95), 3),
        "max": round(values[-1], 3),
    }


def run_soak(config: SoakConfig) -> dict:
    app = Flask("gemstone-session-soak")
    gs_session.init_app(app)
    gs_session._reset_shared_session()

    errors: list[str] = []
    latencies_ms: list[float] = []
    session_ids_by_channel: dict[str, set[int]] = {}
    stats_lock = threading.Lock()

    def worker(worker_index: int) -> None:
        base = worker_index * config.iterations
        for iteration in range(config.iterations):
            operation_index = base + iteration
            channel = _channel_name(operation_index, config.channels)
            is_write = _is_write_iteration(iteration, config.write_every)
            statement = config.write_statement if is_write else config.read_statement
            started = time.perf_counter()
            try:
                with gs_session.request_session(read_only=not is_write, channel=channel) as session:
                    session.eval(statement)
                    session_id = id(session)
                    if is_write:
                        # Keep the Stone clean; the goal is to exercise the
                        # write-channel/session lifecycle, not persist changes.
                        session.abort()
                duration_ms = (time.perf_counter() - started) * 1000.0
                with stats_lock:
                    latencies_ms.append(duration_ms)
                    session_ids_by_channel.setdefault(channel, set()).add(session_id)
            except Exception as exc:  # pragma: no cover - operational path
                with stats_lock:
                    errors.append(f"{channel}: {exc}")
            if config.pause_ms > 0:
                time.sleep(config.pause_ms / 1000.0)

    total_operations = config.workers * config.iterations
    started = time.perf_counter()
    try:
        with ThreadPoolExecutor(max_workers=config.workers) as executor:
            futures = [executor.submit(worker, worker_index) for worker_index in range(config.workers)]
            for future in futures:
                future.result()
    finally:
        duration_seconds = time.perf_counter() - started
        snapshot = gs_session.broker_snapshot()
        gs_session._reset_shared_session()

    return {
        "workers": config.workers,
        "iterationsPerWorker": config.iterations,
        "totalOperations": total_operations,
        "channelsConfigured": config.channels,
        "writeEvery": config.write_every,
        "readStatement": config.read_statement,
        "writeStatement": config.write_statement,
        "pauseMs": config.pause_ms,
        "durationSeconds": round(duration_seconds, 3),
        "operationsPerSecond": round(total_operations / duration_seconds, 3) if duration_seconds else 0.0,
        "latencyMs": _latency_summary(latencies_ms),
        "distinctSessionsByChannel": {
            channel: len(session_ids) for channel, session_ids in sorted(session_ids_by_channel.items())
        },
        "brokerSnapshot": snapshot,
        "errors": errors,
    }


def _parse_args() -> SoakConfig:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=8, help="worker threads to run")
    parser.add_argument("--iterations", type=int, default=100, help="operations per worker")
    parser.add_argument("--channels", type=int, default=4, help="logical channels to spread work across")
    parser.add_argument(
        "--write-every",
        type=int,
        default=5,
        help="treat every Nth operation per worker as a write-channel operation; 0 disables writes",
    )
    parser.add_argument("--read-statement", default="1 + 1", help="Smalltalk to evaluate on read-channel operations")
    parser.add_argument(
        "--write-statement",
        default="1 + 1",
        help="Smalltalk to evaluate on write-channel operations before the explicit abort",
    )
    parser.add_argument("--pause-ms", type=int, default=0, help="optional pause between operations per worker")
    args = parser.parse_args()
    return SoakConfig(
        workers=max(1, args.workers),
        iterations=max(1, args.iterations),
        channels=max(1, args.channels),
        write_every=max(0, args.write_every),
        read_statement=str(args.read_statement),
        write_statement=str(args.write_statement),
        pause_ms=max(0, args.pause_ms),
    )


def main() -> int:
    config = _parse_args()
    summary = run_soak(config)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 1 if summary["errors"] else 0


if __name__ == "__main__":  # pragma: no cover - manual entry point
    raise SystemExit(main())
