import os
import threading
import unittest
from unittest.mock import MagicMock, patch

from gemstone_py import GemStoneConfig as RealGemStoneConfig

from gemstone_p import session as gs_session
from gemstone_p import session_soak


class TestSessionChannelIsolation(unittest.TestCase):
    def setUp(self):
        config_patcher = patch("gemstone_p.session.GemStoneConfig")
        mock_config_cls = config_patcher.start()
        self.mock_config_cls = mock_config_cls
        mock_config_cls.from_env.return_value = MagicMock(stone="defaultStone")
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

    def test_request_session_does_not_abort_explicit_write_channel_reads(self):
        managed = gs_session._ManagedSession(channel="class-browser:win-2-w")
        session = MagicMock()
        with patch.object(gs_session._BROKER, "_ensure_session", return_value=(managed, session)) as mock_ensure:
            with self.flask_app.test_request_context(
                "/class-browser/classes?dictionary=UserGlobals",
                headers={"X-GS-Channel": "class-browser:win-2-w"},
            ):
                with gs_session.request_session(read_only=True):
                    pass
        mock_ensure.assert_called_once_with("class-browser:win-2-w")
        session.abort.assert_not_called()

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

    def test_init_app_accepts_gs_stone_name_alias(self):
        with patch.dict(os.environ, {"GS_STONE_NAME": "seaside"}, clear=False):
            gs_session.init_app(self.flask_app)
        self.assertEqual(gs_session._BROKER._config.stone, "seaside")

    def test_init_app_prefers_gs_stone_over_alias(self):
        self.mock_config_cls.from_env.return_value = MagicMock(stone="explicit")
        with patch.dict(os.environ, {"GS_STONE": "explicit", "GS_STONE_NAME": "seaside"}, clear=False):
            gs_session.init_app(self.flask_app)
        self.assertEqual(gs_session._BROKER._config.stone, "explicit")

    def test_request_session_applies_connection_override_headers(self):
        real_config = RealGemStoneConfig(
            stone="gs64stone",
            netldi="50377",
            host="localhost",
            username="tariq",
            password="secret",
        )
        self.mock_config_cls.from_env.return_value = real_config
        gs_session.init_app(self.flask_app)
        session = MagicMock(_logged_in=False)
        with patch("gemstone_p.session.GemStoneSession", return_value=session) as mock_session_cls:
            with self.flask_app.test_request_context("/ids", headers={"X-GS-Stone": "seaside"}):
                _, returned = gs_session._BROKER._ensure_session("roots-r")
        self.assertIs(returned, session)
        self.assertEqual(mock_session_cls.call_args.kwargs["config"].stone, "seaside")
        self.assertEqual(mock_session_cls.call_args.kwargs["config"].netldi, "50377")

    def test_request_session_drops_managed_session_when_connection_override_changes(self):
        real_config = RealGemStoneConfig(
            stone="gs64stone",
            netldi="50377",
            host="localhost",
            username="tariq",
            password="secret",
        )
        self.mock_config_cls.from_env.return_value = real_config
        gs_session.init_app(self.flask_app)
        session_one = MagicMock(_logged_in=False)
        session_two = MagicMock(_logged_in=False)
        with patch("gemstone_p.session.GemStoneSession", side_effect=[session_one, session_two]) as mock_session_cls:
            with self.flask_app.test_request_context("/ids", headers={"X-GS-Stone": "seaside"}):
                managed_one, _ = gs_session._BROKER._ensure_session("roots-r")
            with self.flask_app.test_request_context("/ids", headers={"X-GS-Stone": "coral"}):
                managed_two, _ = gs_session._BROKER._ensure_session("roots-r")
        self.assertIs(managed_one, managed_two)
        session_one.logout.assert_called_once()
        self.assertEqual(mock_session_cls.call_args_list[0].kwargs["config"].stone, "seaside")
        self.assertEqual(mock_session_cls.call_args_list[1].kwargs["config"].stone, "coral")

    def test_connection_snapshot_reports_request_override(self):
        real_config = RealGemStoneConfig(
            stone="gs64stone",
            netldi="50377",
            host="localhost",
            username="tariq",
            password="secret",
        )
        self.mock_config_cls.from_env.return_value = real_config
        gs_session.init_app(self.flask_app)
        with self.flask_app.test_request_context("/connection/preflight", headers={"X-GS-Stone": "seaside"}):
            snapshot = gs_session.connection_snapshot()
        self.assertEqual(snapshot["stone"], "seaside")
        self.assertEqual(snapshot["stoneSource"], "request-override")
        self.assertTrue(snapshot["overrideActive"])
        self.assertEqual(snapshot["override"]["stone"], "seaside")

    def test_request_session_reuses_single_session_under_concurrent_same_channel_load(self):
        created = []

        def build_session(**kwargs):
            session = MagicMock(_logged_in=False)
            session.config = kwargs.get("config")

            def login():
                session._logged_in = True

            session.login.side_effect = login
            created.append(session)
            return session

        barrier = threading.Barrier(6)
        seen_session_ids = []
        errors = []

        def worker():
            try:
                barrier.wait(timeout=5)
                with gs_session.request_session(read_only=True, channel="stress-same") as session:
                    seen_session_ids.append(id(session))
            except Exception as exc:
                errors.append(exc)

        with patch("gemstone_p.session.GemStoneSession", side_effect=build_session):
            threads = [threading.Thread(target=worker) for _ in range(6)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)

        self.assertEqual(errors, [])
        self.assertEqual(len(created), 1)
        self.assertEqual(len(set(seen_session_ids)), 1)
        created[0].login.assert_called_once()
        self.assertEqual(created[0].abort.call_count, 6)

    def test_request_session_keeps_channels_isolated_under_concurrent_load(self):
        created = []

        def build_session(**kwargs):
            session = MagicMock(_logged_in=False)
            session.config = kwargs.get("config")

            def login():
                session._logged_in = True

            session.login.side_effect = login
            created.append(session)
            return session

        barrier = threading.Barrier(6)
        seen_by_channel = {"stress-a": [], "stress-b": []}
        errors = []

        def worker(channel):
            try:
                barrier.wait(timeout=5)
                with gs_session.request_session(read_only=True, channel=channel) as session:
                    seen_by_channel[channel].append(id(session))
            except Exception as exc:
                errors.append(exc)

        with patch("gemstone_p.session.GemStoneSession", side_effect=build_session):
            threads = [
                threading.Thread(target=worker, args=("stress-a",)),
                threading.Thread(target=worker, args=("stress-a",)),
                threading.Thread(target=worker, args=("stress-a",)),
                threading.Thread(target=worker, args=("stress-b",)),
                threading.Thread(target=worker, args=("stress-b",)),
                threading.Thread(target=worker, args=("stress-b",)),
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)

        self.assertEqual(errors, [])
        self.assertEqual(len(created), 2)
        self.assertEqual(len(set(seen_by_channel["stress-a"])), 1)
        self.assertEqual(len(set(seen_by_channel["stress-b"])), 1)
        self.assertNotEqual(seen_by_channel["stress-a"][0], seen_by_channel["stress-b"][0])
        self.assertEqual(sum(session.login.call_count for session in created), 2)
        self.assertEqual(sum(session.abort.call_count for session in created), 6)


class TestSessionSoakHelpers(unittest.TestCase):
    def test_channel_name_cycles_across_configured_channels(self):
        self.assertEqual(session_soak._channel_name(0, 4), "soak-0")
        self.assertEqual(session_soak._channel_name(3, 4), "soak-3")
        self.assertEqual(session_soak._channel_name(4, 4), "soak-0")
        self.assertEqual(session_soak._channel_name(10, 1), "soak-0")

    def test_write_iteration_respects_interval(self):
        self.assertFalse(session_soak._is_write_iteration(0, 0))
        self.assertFalse(session_soak._is_write_iteration(0, 3))
        self.assertFalse(session_soak._is_write_iteration(1, 3))
        self.assertTrue(session_soak._is_write_iteration(2, 3))

    def test_latency_summary_reports_basic_percentiles(self):
        summary = session_soak._latency_summary([1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertEqual(summary["min"], 1.0)
        self.assertEqual(summary["avg"], 3.0)
        self.assertEqual(summary["p50"], 3.0)
        self.assertEqual(summary["p95"], 4.8)
        self.assertEqual(summary["max"], 5.0)


if __name__ == "__main__":
    unittest.main()
