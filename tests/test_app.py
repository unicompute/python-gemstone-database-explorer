"""Basic smoke tests for gemstone-p routes (no live GemStone required)."""

import json
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch


def _mock_session():
    session = MagicMock()
    session.eval.return_value = 12345
    return session


@contextmanager
def _mock_request_session(session):
    yield session


class TestRoutes(unittest.TestCase):
    def setUp(self):
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

    def test_index_returns_html(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"GemStone Database Explorer", r.data)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_ids(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/ids")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertIn("persistentRootId", data)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_index(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/object/index/12345")
        self.assertEqual(r.status_code, 200)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_commit(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/transaction/commit")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_abort(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/transaction/abort")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])


if __name__ == "__main__":
    unittest.main()
