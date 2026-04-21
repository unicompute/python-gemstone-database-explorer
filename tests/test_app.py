"""Basic smoke tests for gemstone-p routes (no live GemStone required)."""

import json
import unittest
from unittest.mock import MagicMock, patch


class TestRoutes(unittest.TestCase):
    def setUp(self):
        # Patch gemstone-py's install_flask_request_session so we don't need
        # a live GemStone stone to import the app.
        patcher = patch("gemstone_p.session.install_flask_request_session")
        patcher.start()
        self.addCleanup(patcher.stop)

        patcher2 = patch("gemstone_p.session.GemStoneConfig")
        patcher2.start()
        self.addCleanup(patcher2.stop)

        from gemstone_p.app import create_app
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def _mock_session(self):
        session = MagicMock()
        session.eval.return_value = 12345
        return session

    def test_index_returns_html(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"GemStone Database Explorer", r.data)

    @patch("gemstone_p.app.gs_session.get_session")
    def test_ids(self, mock_get):
        mock_get.return_value = self._mock_session()
        r = self.client.get("/ids")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertIn("persistentRootId", data)

    @patch("gemstone_p.app.gs_session.get_session")
    def test_object_index(self, mock_get):
        session = self._mock_session()
        session.eval.side_effect = lambda code: 42 if "basicHash" in code else "String"
        mock_get.return_value = session
        r = self.client.get("/object/index/12345")
        self.assertEqual(r.status_code, 200)

    @patch("gemstone_p.app.gs_session.get_session")
    def test_transaction_commit(self, mock_get):
        session = self._mock_session()
        mock_get.return_value = session
        r = self.client.get("/transaction/commit")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])

    @patch("gemstone_p.app.gs_session.get_session")
    def test_transaction_abort(self, mock_get):
        session = self._mock_session()
        mock_get.return_value = session
        r = self.client.get("/transaction/abort")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])


if __name__ == "__main__":
    unittest.main()
