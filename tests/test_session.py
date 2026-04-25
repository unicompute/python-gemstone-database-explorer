import unittest
from unittest.mock import MagicMock, patch

from gemstone_p import session as gs_session


class TestSessionChannelIsolation(unittest.TestCase):
    def setUp(self):
        config_patcher = patch("gemstone_p.session.GemStoneConfig")
        mock_config_cls = config_patcher.start()
        mock_config_cls.from_env.return_value = MagicMock()
        self.addCleanup(config_patcher.stop)

        self.app = MagicMock()
        self.flask_app = __import__("flask").Flask(__name__)
        gs_session.init_app(self.flask_app)
        gs_session._reset_shared_session()
        self.addCleanup(gs_session._reset_shared_session)

    def test_request_session_uses_main_channel_without_request_context(self):
        managed = gs_session._ManagedSession(channel="main-r")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with gs_session.request_session(read_only=True):
                pass
        mock_ensure.assert_called_once_with("main-r")
        session.abort.assert_called_once()

    def test_request_session_uses_class_browser_read_channel(self):
        managed = gs_session._ManagedSession(channel="class-browser-r")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context("/class-browser/source?class=Object"):
                with gs_session.request_session(read_only=True):
                    pass
        mock_ensure.assert_called_once_with("class-browser-r")
        session.abort.assert_called_once()

    def test_request_session_uses_class_browser_write_channel(self):
        managed = gs_session._ManagedSession(channel="class-browser-w")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context("/class-browser/compile", method="POST"):
                with gs_session.request_session(read_only=False):
                    pass
        mock_ensure.assert_called_once_with("class-browser-w")
        session.abort.assert_not_called()

    def test_request_session_uses_debug_channel(self):
        managed = gs_session._ManagedSession(channel="debug-r")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context("/debug/frame/123?index=0"):
                with gs_session.request_session(read_only=True):
                    pass
        mock_ensure.assert_called_once_with("debug-r")

    def test_request_session_preserves_explicit_channel(self):
        managed = gs_session._ManagedSession(channel="custom-w")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context("/object/index/20"):
                with gs_session.request_session(read_only=False, channel="custom"):
                    pass
        mock_ensure.assert_called_once_with("custom-w")

    def test_request_session_uses_header_channel_family(self):
        managed = gs_session._ManagedSession(channel="workspace:win-7-r")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context("/object/index/20", headers={"X-GS-Channel": "workspace:win-7"}):
                with gs_session.request_session(read_only=True):
                    pass
        mock_ensure.assert_called_once_with("workspace:win-7-r")
        session.abort.assert_called_once()

    def test_request_session_preserves_exact_explicit_channel_suffix(self):
        managed = gs_session._ManagedSession(channel="debugger:win-2-w")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context("/debug/proceed/123", method="POST"):
                with gs_session.request_session(read_only=False, channel="debugger:win-2-w"):
                    pass
        mock_ensure.assert_called_once_with("debugger:win-2-w")

    def test_broker_snapshot_reports_managed_channels(self):
        gs_session._BROKER._managed = {
            "object:win-1-r": gs_session._ManagedSession(channel="object:win-1-r", session=MagicMock(_logged_in=True)),
            "workspace:win-3-w": gs_session._ManagedSession(channel="workspace:win-3-w", session=None),
        }
        gs_session._BROKER._default_auto_begin = True
        snapshot = gs_session.broker_snapshot()
        self.assertEqual(snapshot["defaultAutoBegin"], True)
        self.assertEqual(snapshot["managedSessionCount"], 2)
        self.assertEqual(snapshot["channels"][0]["name"], "object:win-1-r")
        self.assertTrue(snapshot["channels"][0]["loggedIn"])
        self.assertEqual(snapshot["channels"][1]["name"], "workspace:win-3-w")
        self.assertFalse(snapshot["channels"][1]["hasSession"])


if __name__ == "__main__":
    unittest.main()
