"""Offline checks for the base agent. Run: python -m unittest discover -s tests -v"""

import asyncio
import unittest

from agent.__main__ import build_parser
from agent.modules import modules
from agent.server import app, home


class AgentTest(unittest.TestCase):
    def test_home_lists_the_generated_modules(self) -> None:
        body = asyncio.run(home())
        self.assertEqual(body["modules"], modules)

    def test_every_route_file_loaded(self) -> None:
        paths = {getattr(route, "path", None) for route in app.routes}
        self.assertIn("/", paths)

    def test_command_line_parses(self) -> None:
        args = build_parser().parse_args(["serve"])
        self.assertEqual(args.command, "serve")


if __name__ == "__main__":
    unittest.main()
