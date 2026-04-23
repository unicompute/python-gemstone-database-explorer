"""CLI entry point — `python-gemstone-database-explorer` command."""

from __future__ import annotations

import argparse
import sys

from gemstone_p.app import create_app


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="python-gemstone-database-explorer",
        description="GemStone Database Explorer",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=9292, help="Port (default: 9292)")
    parser.add_argument("--debug", action="store_true", help="Enable Flask debug mode")
    args = parser.parse_args(argv)

    app = create_app()
    print(f"GemStone Database Explorer running at http://{args.host}:{args.port}/")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=False)


if __name__ == "__main__":
    main()
